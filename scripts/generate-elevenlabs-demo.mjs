import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';
const speaker = process.argv[2] || 'user';
const requests = {
  user: {
    voiceId: process.env.ELEVENLABS_USER_VOICE_ID?.trim()
      || process.env.ELEVENLABS_VOICE_ID?.trim(),
    text: 'Как превратить сохранённый диалог в готовое видео?',
  },
  assistant: {
    voiceId: process.env.ELEVENLABS_ASSISTANT_VOICE_ID?.trim(),
    text: 'Приложение создаёт виртуальное окно браузера, озвучивает реплики и показывает каждое слово синхронно с голосом. Когда активное сообщение становится длиннее видимой области, чат плавно прокручивается вниз.',
  },
};
const request = requests[speaker];

if (!apiKey) throw new Error('ELEVENLABS_API_KEY отсутствует в .env.local.');
if (!request) throw new Error('Укажите участника: user или assistant.');
if (!request.voiceId) throw new Error(`Voice ID для ${speaker} отсутствует в .env.local.`);

const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'xi-api-key': apiKey},
    body: JSON.stringify({text: request.text, model_id: modelId}),
  },
);

if (!response.ok) {
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    message = typeof body.detail === 'string' ? body.detail : body.detail?.message || message;
  } catch {}
  throw new Error(`ElevenLabs: ${message}`);
}

const payload = await response.json();
const alignment = payload.alignment;
if (!payload.audio_base64 || !alignment) throw new Error('Ответ не содержит аудио или тайминги.');

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

const durationMs = Math.max(...alignment.character_end_times_seconds.map((value) => Math.round(value * 1000)));
await mkdir(resolve(root, 'public/audio'), {recursive: true});
await writeFile(resolve(root, `public/audio/elevenlabs-${speaker}.mp3`), Buffer.from(payload.audio_base64, 'base64'));
await writeFile(resolve(root, `src/data/elevenlabs-${speaker}.generated.json`), JSON.stringify({
  audioPath: `audio/elevenlabs-${speaker}.mp3`,
  durationMs,
  words,
}, null, 2) + '\n');
console.log(`ElevenLabs ${speaker} sample generated: ${words.length} words, ${(durationMs / 1000).toFixed(2)} seconds.`);
