import {mkdir, unlink, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createAuth} from './auth.mjs';
import {createUserSettingsStore} from './user-settings.mjs';
import {createWorkspace} from './workspace.mjs';
import {sendFile} from './static.mjs';

const MAX_BODY_BYTES = 100_000;
const MAX_IMAGE_BYTES = 10_000_000;
const MAX_TTS_QUEUE_SIZE = 100;
const ELEVENLABS_MODELS = new Set(['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']);

export const sanitizeVoiceId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.trim()) ? value.trim() : '';

export const sanitizeApiKey = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\r\n]/.test(trimmed)) return '';
  return trimmed;
};

export const allowedOrigins = (environment = {}) => {
  const extras = String(environment.PUBLIC_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([
    'http://127.0.0.1:4173',
    'http://localhost:4173',
    ...extras,
  ]);
};

export const isAllowedOrigin = (origin, environment = {}) => {
  if (!origin) return true;
  return allowedOrigins(environment).has(String(origin).replace(/\/$/, ''));
};

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

const applyCors = (request, response, environment) => {
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(origin, environment)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Message-Id, X-File-Name, X-Image-Width, X-Image-Height');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }
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

const resolveChromePath = (environment = {}) => {
  const configured = environment.CHROME_PATH?.trim();
  if (configured) return configured;
  if (existsSync('/usr/bin/chromium')) return '/usr/bin/chromium';
  if (existsSync('/usr/bin/chromium-browser')) return '/usr/bin/chromium-browser';
  return '/usr/bin/google-chrome';
};

const pathnameOf = (request) => {
  const raw = String(request.url || '/').split('?')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const createStudioApi = ({environment = {}, projectRoot = process.cwd()} = {}) => {
  const renderJobs = new Map();
  const ttsQueue = createSerialQueue();
  const root = resolve(projectRoot);
  const auth = createAuth(environment);
  const userSettings = createUserSettingsStore({
    directory: environment.SETTINGS_DIR || resolve(root, 'data/settings'),
  });
  const workspace = createWorkspace({root, environment});
  const actorId = (request) => auth.sessionOf(request)?.userId || (auth.enabled ? '' : 'local');

  return async (request, response) => {
    applyCors(request, response, environment);
    const path = pathnameOf(request);

    if (path.startsWith('/workspace/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        json(response, 405, {error: 'Метод не поддерживается.'});
        return true;
      }
      const userId = actorId(request);
      if (auth.enabled && !userId) {
        json(response, 401, {error: 'Нужна авторизация.'});
        return true;
      }
      const parts = path.split('/').filter(Boolean);
      const projectId = parts[1] || '';
      if (userId && !(await workspace.owns(userId, projectId))) {
        json(response, 404, {error: 'Файл не найден.'});
        return true;
      }
      const file = workspace.publicFile(projectId, parts.slice(2));
      if (file && await sendFile(request, response, file)) return true;
      json(response, 404, {error: 'Файл не найден.'});
      return true;
    }

    if (!path.startsWith('/api/')) return false;

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return true;
    }

    if (request.method === 'GET' && path === '/api/health') {
      json(response, 200, {ok: true});
      return true;
    }

    const origin = request.headers.origin;
    if (!isAllowedOrigin(origin, environment)) {
      json(response, 403, {error: 'Недопустимый источник запроса.'});
      return true;
    }

    if (path === '/api/login' && request.method === 'POST') {
      try {
        const body = await readJson(request);
        const result = await auth.login(
          typeof body.email === 'string' ? body.email : typeof body.username === 'string' ? body.username : '',
          typeof body.password === 'string' ? body.password : '',
          auth.clientAddress(request),
        );
        if (!result.ok) return json(response, 401, {error: result.error});
        auth.attachSessionCookie(response, result.token);
        json(response, 200, {
          username: result.username,
          userId: result.userId,
          membershipStatus: result.membershipStatus,
          auth: true,
        });
      } catch (error) {
        json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка входа.'});
      }
      return true;
    }

    if (path === '/api/logout' && request.method === 'POST') {
      auth.logout(request);
      auth.clearSessionCookie(response);
      json(response, 200, {ok: true});
      return true;
    }

    if (path === '/api/session' && request.method === 'GET') {
      if (!auth.enabled) {
        json(response, 200, {username: 'local', auth: false});
        return true;
      }
      const session = auth.sessionOf(request);
      if (!session) {
        json(response, 401, {error: 'Нужна авторизация.'});
        return true;
      }
      json(response, 200, {
        username: session.username,
        userId: session.userId,
        membershipStatus: session.membershipStatus,
        auth: true,
      });
      return true;
    }

    if (auth.enabled && !auth.sessionOf(request)) {
      json(response, 401, {error: 'Нужна авторизация.'});
      return true;
    }

    if (path === '/api/settings' && request.method === 'GET') {
      const session = auth.sessionOf(request);
      if (!session?.userId) {
        json(response, 200, {apiKey: '', userVoiceId: '', assistantVoiceId: '', source: 'local'});
        return true;
      }
      const stored = await userSettings.read(session.userId);
      json(response, 200, {...stored, source: 'account'});
      return true;
    }

    if (path === '/api/settings' && (request.method === 'PUT' || request.method === 'POST')) {
      const session = auth.sessionOf(request);
      if (!session?.userId) {
        json(response, 400, {error: 'Нет учётки для сохранения настроек.'});
        return true;
      }
      try {
        const body = await readJson(request);
        const saved = await userSettings.write(session.userId, body);
        json(response, 200, {...saved, source: 'account'});
      } catch (error) {
        json(response, 400, {error: error instanceof Error ? error.message : 'Не удалось сохранить настройки.'});
      }
      return true;
    }

    if (path === '/api/projects' && request.method === 'GET') {
      json(response, 200, {
        projects: await workspace.list(actorId(request)),
        maxProjects: workspace.maxProjects,
        maxDurationMs: workspace.maxDurationMs,
      });
      return true;
    }

    if (path === '/api/projects' && request.method === 'POST') {
      try {
        const body = await readJson(request, 5_000_000);
        const created = await workspace.create(actorId(request), body);
        json(response, 201, created);
      } catch (error) {
        json(response, 400, {error: error instanceof Error ? error.message : 'Не удалось создать проект.'});
      }
      return true;
    }

    if (path.startsWith('/api/projects/')) {
      const projectId = path.slice('/api/projects/'.length).split('/')[0];
      const userId = actorId(request);
      if (request.method === 'GET') {
        try {
          json(response, 200, {id: projectId, snapshot: await workspace.load(userId, projectId)});
        } catch (error) {
          json(response, 404, {error: error instanceof Error ? error.message : 'Проект не найден.'});
        }
        return true;
      }
      if (request.method === 'PUT') {
        try {
          const body = await readJson(request, 5_000_000);
          json(response, 200, await workspace.save(userId, projectId, body));
        } catch (error) {
          json(response, 400, {error: error instanceof Error ? error.message : 'Не удалось сохранить проект.'});
        }
        return true;
      }
      if (request.method === 'DELETE') {
        try {
          json(response, 200, await workspace.remove(userId, projectId));
        } catch (error) {
          json(response, 400, {error: error instanceof Error ? error.message : 'Не удалось удалить проект.'});
        }
        return true;
      }
    }

    if (path === '/api/tts' && request.method === 'POST') {
      try {
        const body = await readJson(request);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const role = body.role === 'assistant' ? 'assistant' : 'user';
        const messageId = String(body.messageId || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 100);
        const apiKey = sanitizeApiKey(body.apiKey) || sanitizeApiKey(environment.ELEVENLABS_API_KEY);
        const requestedVoiceId = body.voiceId || (role === 'assistant' ? body.assistantVoiceId : body.userVoiceId);
        if (typeof requestedVoiceId === 'string' && requestedVoiceId.trim() && !sanitizeVoiceId(requestedVoiceId)) {
          throw new Error('Voice ID содержит недопустимые символы.');
        }
        const voiceId = sanitizeVoiceId(requestedVoiceId) || (role === 'assistant'
          ? sanitizeVoiceId(environment.ELEVENLABS_ASSISTANT_VOICE_ID)
          : sanitizeVoiceId(environment.ELEVENLABS_USER_VOICE_ID) || sanitizeVoiceId(environment.ELEVENLABS_VOICE_ID));
        const requestedModelId = typeof body.modelId === 'string' ? body.modelId.trim() : '';
        const modelId = ELEVENLABS_MODELS.has(requestedModelId)
          ? requestedModelId
          : environment.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';

        if (!messageId) throw new Error('Некорректный идентификатор реплики.');
        if (!text) throw new Error('Текст реплики пуст.');
        if (text.length > 10_000) throw new Error('Реплика превышает 10 000 символов.');
        if (!apiKey) throw new Error('ElevenLabs API key не настроен.');
        if (!voiceId) throw new Error(`Голос для роли ${role} не настроен.`);
        const projectId = String(body.projectId || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
        const userId = actorId(request);
        if (!projectId || !(await workspace.owns(userId, projectId))) {
          throw new Error('Сначала сохраните проект в кабинете (не больше двух, до 60 минут).');
        }

        const queuePosition = ttsQueue.size + 1;
        const take = await ttsQueue.add(async () => {
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
            } catch {
              // Тело ошибки ElevenLabs может содержать чувствительные данные.
            }
            if (upstream.status === 401 || upstream.status === 403) {
              throw new Error('ElevenLabs отклонил API-ключ.');
            }
            throw new Error(`ElevenLabs: ${detail}`);
          }

          const payload = await upstream.json();
          if (!payload.audio_base64 || !payload.alignment) throw new Error('ElevenLabs не вернул аудио или тайминги.');
          const words = alignmentToWords(payload.alignment);
          const durationMs = Math.max(...payload.alignment.character_end_times_seconds.map((value) => Math.round(value * 1000)));
          const takeId = `take-${Date.now()}-${randomUUID().slice(0, 8)}`;
          const directory = workspace.mediaDirectory(projectId, 'generated', messageId);
          await mkdir(directory, {recursive: true});
          await writeFile(resolve(directory, `${takeId}.mp3`), Buffer.from(payload.audio_base64, 'base64'));

          return {
            id: takeId,
            audioPath: workspace.mediaUrl(projectId, `generated/${messageId}/${takeId}.mp3`),
            durationMs,
            words,
            sourceText: text,
            createdAt: new Date().toISOString(),
            alignment: 'provider',
          };
        });

        json(response, 200, {take, queuePosition});
      } catch (error) {
        json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка генерации.'});
      }
      return true;
    }

    if (path === '/api/image' && request.method === 'POST') {
      try {
        const messageId = String(request.headers['x-message-id'] || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 100);
        const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const extensions = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};
        const extension = extensions[mimeType];
        const width = Number(request.headers['x-image-width']);
        const height = Number(request.headers['x-image-height']);
        let fileName = 'image';
        try { fileName = decodeURIComponent(String(request.headers['x-file-name'] || 'image')); } catch {}

        const projectId = String(request.headers['x-project-id'] || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
        const userId = actorId(request);
        if (!projectId || !(await workspace.owns(userId, projectId))) {
          throw new Error('Сначала сохраните проект в кабинете.');
        }
        if (!messageId) throw new Error('Некорректный идентификатор реплики.');
        if (!extension) throw new Error('Поддерживаются только PNG, JPEG и WebP.');
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 20_000 || height > 20_000) {
          throw new Error('Не удалось определить размеры изображения.');
        }

        const bytes = await readBuffer(request, MAX_IMAGE_BYTES);
        if (!bytes.length) throw new Error('Файл изображения пуст.');
        const imageId = `image-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const directory = workspace.mediaDirectory(projectId, 'uploads', messageId);
        await mkdir(directory, {recursive: true});
        await writeFile(resolve(directory, `${imageId}.${extension}`), bytes);

        json(response, 200, {image: {
          id: imageId,
          path: workspace.mediaUrl(projectId, `uploads/${messageId}/${imageId}.${extension}`),
          fileName: fileName.slice(0, 200),
          width,
          height,
          fit: 'contain',
          position: 'before-text',
          reveal: 'bubble',
        }});
      } catch (error) {
        json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка загрузки изображения.'});
      }
      return true;
    }

    if (path === '/api/render' || path.startsWith('/api/render/')) {
      const jobId = path.slice('/api/render/'.length);

      if (request.method === 'GET' && jobId) {
        const job = renderJobs.get(jobId);
        job ? json(response, 200, job) : json(response, 404, {error: 'Задача рендера не найдена.'});
        return true;
      }
      if (request.method !== 'POST' || path !== '/api/render') {
        json(response, 405, {error: 'Метод не поддерживается.'});
        return true;
      }
      if ([...renderJobs.values()].some((job) => job.status === 'rendering')) {
        json(response, 409, {error: 'Другой рендер уже выполняется.'});
        return true;
      }

      try {
        const body = await readJson(request, 5_000_000);
        const project = body?.project;
        if (!project || typeof project !== 'object' || !Array.isArray(project.messages) || project.messages.length === 0) {
          throw new Error('Проект не содержит реплик.');
        }
        if (project.messages.length > 500) throw new Error('В одном рендере допускается не более 500 реплик.');
        const projectId = String(body.projectId || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
        const userId = actorId(request);
        if (!projectId || !(await workspace.owns(userId, projectId))) {
          throw new Error('Сначала сохраните проект в кабинете.');
        }

        const id = `render-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const jobsDirectory = resolve(root, '.render-jobs');
        const outputDirectory = workspace.mediaDirectory(projectId, 'renders');
        const propsPath = resolve(jobsDirectory, `${id}.json`);
        const outputPath = resolve(outputDirectory, `${id}.mp4`);
        await mkdir(jobsDirectory, {recursive: true});
        await mkdir(outputDirectory, {recursive: true});
        await writeFile(propsPath, JSON.stringify({project}), 'utf8');

        const job = {id, status: 'rendering', startedAt: new Date().toISOString()};
        renderJobs.set(id, job);

        const chromePath = resolveChromePath(environment);
        const concurrency = environment.RENDER_CONCURRENCY?.trim() || '1';
        const args = [
          resolve(root, 'node_modules/@remotion/cli/remotion-cli.js'),
          'render',
          'src/remotion/index.ts',
          'ChatVideoPrototype',
          outputPath,
          `--props=${propsPath}`,
          '--codec=h264',
          '--overwrite',
          `--browser-executable=${chromePath}`,
          `--concurrency=${concurrency}`,
        ];

        const childEnv = {...process.env, ...environment};
        if (environment.CHROME_NO_SANDBOX === '1') {
          childEnv.CHROME_DISABLE_SANDBOX = '1';
          childEnv.PUPPETEER_CHROMIUM_REVISION = childEnv.PUPPETEER_CHROMIUM_REVISION || '';
        }

        const child = spawn(process.execPath, args, {cwd: root, env: childEnv});
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
              ? {status: 'complete', url: `/${workspace.mediaUrl(projectId, `renders/${id}.mp4`)}`, finishedAt: new Date().toISOString()}
              : {status: 'failed', error: output.trim() || `Remotion завершился с кодом ${code}.`, finishedAt: new Date().toISOString()});
          }
          await unlink(propsPath).catch(() => undefined);
        });

        json(response, 202, job);
      } catch (error) {
        json(response, 400, {error: error instanceof Error ? error.message : 'Ошибка запуска рендера.'});
      }
      return true;
    }

    json(response, 404, {error: 'Неизвестный API-маршрут.'});
    return true;
  };
};
