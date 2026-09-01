import {mkdir, unlink, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const MAX_BODY_BYTES = 100_000;
const MAX_IMAGE_BYTES = 10_000_000;
const MAX_TTS_QUEUE_SIZE = 100;
const ELEVENLABS_MODELS = new Set(['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']);
const sanitizeVoiceId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.trim()) ? value.trim() : '';

export const createSerialQueue = (maxSize = MAX_TTS_QUEUE_SIZE) => {
  const pending = [];
  let active = false;

  const runNext = () => {
    if (active) return;
    const next = pending.shift();
    if (!next) return;

    active = true;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        active = false;
        runNext();
      });
  };

  return {
    add(task) {
      if (pending.length + Number(active) >= maxSize) {
        return Promise.reject(new Error(`Очередь озвучки заполнена (максимум ${maxSize} заданий).`));
      }
      return new Promise((resolvePromise, reject) => {
        pending.push({task, resolve: resolvePromise, reject});
        runNext();
      });
    },
    get size() {
      return pending.length + Number(active);
    },
  };
};

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const readJson = async (request, maxBytes = MAX_BODY_BYTES) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Слишком большой запрос.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const readBuffer = async (request, maxBytes) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Файл изображения превышает 10 МБ.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const isAllowedOrigin = (origin) => !origin || /^http:\/\/(127\.0\.0\.1|localhost):4173$/.test(origin);

const alignmentToWords = (alignment) => {
  const words = [];
  let current = null;
  for (let index = 0; index < alignment.characters.length; index += 1) {
    const character = alignment.characters[index];
    if (/\s/u.test(character)) {
      if (current) words.push(current);
      current = null;
      continue;
    }
    if (!current) {
      current = {
        text: '',
        startMs: Math.round(alignment.character_start_times_seconds[index] * 1000),
        endMs: 0,
      };
    }
    current.text += character;
    current.endMs = Math.round(alignment.character_end_times_seconds[index] * 1000);
  }
  if (current) words.push(current);
  return words;
};

const approximateWords = (text, durationMs) => {
  const parts = text.split(/\s+/u).filter(Boolean);
  const weights = parts.map((part) => Math.max(2, part.replace(/[^\p{L}\p{N}]/gu, '').length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return parts.map((part, index) => {
    const startMs = Math.round(cursor);
    cursor += (durationMs * weights[index]) / total;
    return {text: part, startMs, endMs: Math.max(startMs, Math.round(cursor - 35))};
  });
};

const alignWithWhisper = ({text, audioPath, durationMs, environment}) => new Promise((resolvePromise, reject) => {
  const pythonRoot = resolve(process.cwd(), '.venv-xtts');
  const sitePackages = resolve(pythonRoot, 'lib/python3.12/site-packages');
  const cudaLibraries = ['cublas', 'cudnn', 'cuda_runtime'].map((name) => resolve(sitePackages, `nvidia/${name}/lib`));
  const child = spawn(resolve(pythonRoot, 'bin/python'), [
    resolve(process.cwd(), 'scripts/align-whisper.py'),
    '--audio', audioPath,
    '--text', text,
    '--duration-ms', String(durationMs),
    '--model', environment.XTTS_ALIGNMENT_MODEL?.trim() || 'small',
    '--language', environment.XTTS_LANGUAGE?.trim() || 'ru',
  ], {
    cwd: process.cwd(),
    env: {...process.env, LD_LIBRARY_PATH: [...cudaLibraries, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':')},
  });

  let output = '';
  const collect = (chunk) => { output = `${output}${chunk.toString()}`.slice(-16000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', reject);
  child.on('close', (code) => {
    const match = output.match(/ALIGN_RESULT=(\{[^\n]+\})/);
    if (code !== 0 || !match) {
      reject(new Error(output.trim() || `Whisper завершился с кодом ${code}.`));
      return;
    }
    const alignment = JSON.parse(match[1]);
    if (alignment.matchRatio < 0.45) {
      reject(new Error(`Whisper недостаточно уверенно сопоставил текст (${Math.round(alignment.matchRatio * 100)}%).`));
      return;
    }
    resolvePromise(alignment);
  });
});

const generateWithXtts = async ({text, role, messageId, environment}) => {
  const reference = role === 'assistant'
    ? environment.XTTS_ASSISTANT_REFERENCE?.trim() || resolve(process.cwd(), 'voice-samples/assistant.wav')
    : environment.XTTS_USER_REFERENCE?.trim() || resolve(process.cwd(), 'voice-samples/user.wav');

  const takeId = `take-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const directory = resolve(process.cwd(), 'public/generated', messageId);
  const outputPath = resolve(directory, `${takeId}.wav`);
  await mkdir(directory, {recursive: true});
  return new Promise((resolvePromise, reject) => {
    const child = spawn(resolve(process.cwd(), '.venv-xtts/bin/python'), [
      resolve(process.cwd(), 'scripts/xtts-generate.py'),
      '--text', text,
      '--reference', reference,
      '--output', outputPath,
      '--language', environment.XTTS_LANGUAGE?.trim() || 'ru',
    ], {cwd: process.cwd(), env: process.env});

    let output = '';
    const collect = (chunk) => { output = `${output}${chunk.toString()}`.slice(-12000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => {
      const match = output.match(/XTTS_RESULT=(\{[^\n]+\})/);
      if (code !== 0 || !match) {
        reject(new Error(output.trim() || `XTTS завершился с кодом ${code}.`));
        return;
      }
      const result = JSON.parse(match[1]);
      alignWithWhisper({text, audioPath: outputPath, durationMs: result.durationMs, environment})
        .then((alignment) => resolvePromise({
        id: takeId,
        audioPath: `generated/${messageId}/${takeId}.wav`,
        durationMs: result.durationMs,
        words: alignment.words,
        sourceText: text,
        createdAt: new Date().toISOString(),
        alignment: 'whisper',
      }))
        .catch(() => resolvePromise({
          id: takeId,
          audioPath: `generated/${messageId}/${takeId}.wav`,
          durationMs: result.durationMs,
          words: approximateWords(text, result.durationMs),
          sourceText: text,
          createdAt: new Date().toISOString(),
          alignment: 'approximate',
        }));
    });
  });
};

export const elevenLabsTtsPlugin = (environment) => {
  const renderJobs = new Map();
  const ttsQueue = createSerialQueue();

  return ({
  name: 'local-elevenlabs-tts',
  configureServer(server) {
    server.middlewares.use('/api/tts', async (request, response) => {
      if (request.method !== 'POST') return json(response, 405, {error: 'Метод не поддерживается.'});
      const origin = request.headers.origin;
      if (!isAllowedOrigin(origin)) {
        return json(response, 403, {error: 'Недопустимый источник запроса.'});
      }

      try {
        const body = await readJson(request);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const role = body.role === 'assistant' ? 'assistant' : 'user';
        const provider = body.provider === 'xtts' ? 'xtts' : 'elevenlabs';
        const messageId = String(body.messageId || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 100);
        const apiKey = environment.ELEVENLABS_API_KEY?.trim();
        const requestedVoiceId = role === 'assistant' ? body.assistantVoiceId : body.userVoiceId;
        const sanitizedRequestedVoiceId = sanitizeVoiceId(requestedVoiceId);
        if (typeof requestedVoiceId === 'string' && requestedVoiceId.trim() && !sanitizedRequestedVoiceId) {
          throw new Error('Voice ID содержит недопустимые символы.');
        }
        const voiceId = sanitizedRequestedVoiceId || (role === 'assistant'
          ? environment.ELEVENLABS_ASSISTANT_VOICE_ID?.trim()
          : environment.ELEVENLABS_USER_VOICE_ID?.trim() || environment.ELEVENLABS_VOICE_ID?.trim());
        const requestedModelId = typeof body.modelId === 'string' ? body.modelId.trim() : '';
        const modelId = ELEVENLABS_MODELS.has(requestedModelId)
          ? requestedModelId
          : environment.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';

        if (!messageId) throw new Error('Некорректный идентификатор реплики.');
        if (!text) throw new Error('Текст реплики пуст.');
        if (text.length > 10_000) throw new Error('Реплика превышает 10 000 символов.');

        const queuePosition = ttsQueue.size + 1;
        const take = await ttsQueue.add(async () => {
          if (provider === 'xtts') {
            return generateWithXtts({text, role, messageId, environment});
          }

          if (!apiKey) throw new Error('ElevenLabs API key не настроен.');
          if (!voiceId) throw new Error(`Голос для роли ${role} не настроен.`);

          const upstream = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: {'Content-Type': 'application/json', 'xi-api-key': apiKey},
              body: JSON.stringify({text, model_id: modelId}),
            },
          );
          if (!upstream.ok) {
            let detail = `HTTP ${upstream.status}`;
            try {
              const errorBody = await upstream.json();
              detail = typeof errorBody.detail === 'string' ? errorBody.detail : errorBody.detail?.message || detail;
            } catch {}
            throw new Error(`ElevenLabs: ${detail}`);
          }

          const payload = await upstream.json();
          if (!payload.audio_base64 || !payload.alignment) throw new Error('ElevenLabs не вернул аудио или тайминги.');
          const words = alignmentToWords(payload.alignment);
          const durationMs = Math.max(...payload.alignment.character_end_times_seconds.map((value) => Math.round(value * 1000)));
          const takeId = `take-${Date.now()}-${randomUUID().slice(0, 8)}`;
          const directory = resolve(process.cwd(), 'public/generated', messageId);
          await mkdir(directory, {recursive: true});
          await writeFile(resolve(directory, `${takeId}.mp3`), Buffer.from(payload.audio_base64, 'base64'));

          return {
            id: takeId,
            audioPath: `generated/${messageId}/${takeId}.mp3`,
            durationMs,
            words,
            sourceText: text,
            createdAt: new Date().toISOString(),
            alignment: 'provider',
          };
        });

        return json(response, 200, {take, queuePosition});
      } catch (error) {
        return json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка генерации.'});
      }
    });

    server.middlewares.use('/api/image', async (request, response) => {
      if (request.method !== 'POST') return json(response, 405, {error: 'Метод не поддерживается.'});
      if (!isAllowedOrigin(request.headers.origin)) return json(response, 403, {error: 'Недопустимый источник запроса.'});

      try {
        const messageId = String(request.headers['x-message-id'] || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 100);
        const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const extensions = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};
        const extension = extensions[mimeType];
        const width = Number(request.headers['x-image-width']);
        const height = Number(request.headers['x-image-height']);
        let fileName = 'image';
        try { fileName = decodeURIComponent(String(request.headers['x-file-name'] || 'image')); } catch {}

        if (!messageId) throw new Error('Некорректный идентификатор реплики.');
        if (!extension) throw new Error('Поддерживаются только PNG, JPEG и WebP.');
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 20_000 || height > 20_000) {
          throw new Error('Не удалось определить размеры изображения.');
        }

        const bytes = await readBuffer(request, MAX_IMAGE_BYTES);
        if (!bytes.length) throw new Error('Файл изображения пуст.');
        const imageId = `image-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const directory = resolve(process.cwd(), 'public/uploads', messageId);
        await mkdir(directory, {recursive: true});
        await writeFile(resolve(directory, `${imageId}.${extension}`), bytes);

        return json(response, 200, {image: {
          id: imageId,
          path: `uploads/${messageId}/${imageId}.${extension}`,
          fileName: fileName.slice(0, 200),
          width,
          height,
          fit: 'contain',
          position: 'before-text',
          reveal: 'bubble',
        }});
      } catch (error) {
        return json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка загрузки изображения.'});
      }
    });

    server.middlewares.use('/api/render', async (request, response) => {
      if (!isAllowedOrigin(request.headers.origin)) return json(response, 403, {error: 'Недопустимый источник запроса.'});

      const jobId = String(request.url || '').replace(/^\//, '').split('?')[0];
      if (request.method === 'GET' && jobId) {
        const job = renderJobs.get(jobId);
        return job
          ? json(response, 200, job)
          : json(response, 404, {error: 'Задача рендера не найдена.'});
      }
      if (request.method !== 'POST') return json(response, 405, {error: 'Метод не поддерживается.'});
      if ([...renderJobs.values()].some((job) => job.status === 'rendering')) {
        return json(response, 409, {error: 'Другой рендер уже выполняется.'});
      }

      try {
        const body = await readJson(request, 5_000_000);
        const project = body?.project;
        if (!project || typeof project !== 'object' || !Array.isArray(project.messages) || project.messages.length === 0) {
          throw new Error('Проект не содержит реплик.');
        }
        if (project.messages.length > 500) throw new Error('В одном рендере допускается не более 500 реплик.');

        const id = `render-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const jobsDirectory = resolve(process.cwd(), '.render-jobs');
        const outputDirectory = resolve(process.cwd(), 'public/renders');
        const propsPath = resolve(jobsDirectory, `${id}.json`);
        const outputPath = resolve(outputDirectory, `${id}.mp4`);
        await mkdir(jobsDirectory, {recursive: true});
        await mkdir(outputDirectory, {recursive: true});
        await writeFile(propsPath, JSON.stringify({project}), 'utf8');

        const job = {id, status: 'rendering', startedAt: new Date().toISOString()};
        renderJobs.set(id, job);
        const child = spawn(process.execPath, [
          resolve(process.cwd(), 'node_modules/@remotion/cli/remotion-cli.js'),
          'render',
          'src/remotion/index.ts',
          'ChatVideoPrototype',
          outputPath,
          `--props=${propsPath}`,
          '--codec=h264',
          '--overwrite',
          '--browser-executable=/usr/bin/google-chrome',
          '--concurrency=2',
        ], {cwd: process.cwd(), env: process.env});

        let output = '';
        const collect = (chunk) => { output = `${output}${chunk.toString()}`.slice(-8000); };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', async (error) => {
          Object.assign(job, {status: 'failed', error: error.message, finishedAt: new Date().toISOString()});
          await unlink(propsPath).catch(() => undefined);
        });
        child.on('close', async (code) => {
          if (job.status !== 'failed') {
            Object.assign(job, code === 0
              ? {status: 'complete', url: `/renders/${id}.mp4`, finishedAt: new Date().toISOString()}
              : {status: 'failed', error: output.trim() || `Remotion завершился с кодом ${code}.`, finishedAt: new Date().toISOString()});
          }
          await unlink(propsPath).catch(() => undefined);
        });

        return json(response, 202, job);
      } catch (error) {
        return json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка запуска рендера.'});
      }
    });
  },
  });
};
