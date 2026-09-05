import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const sanitizeVoiceId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.trim()) ? value.trim() : '';

const sanitizeApiKey = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\r\n]/.test(trimmed)) return '';
  return trimmed;
};

const sanitizeSpeakerVoiceIds = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = String(key).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
    const voiceId = sanitizeVoiceId(raw);
    if (id && voiceId) result[id] = voiceId;
  }
  return result;
};

export const emptyUserSettings = () => ({
  apiKey: '',
  userVoiceId: '',
  assistantVoiceId: '',
  speakerVoiceIds: {},
});

export const normalizeUserSettings = (value) => {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    apiKey: sanitizeApiKey(record.apiKey),
    userVoiceId: sanitizeVoiceId(record.userVoiceId),
    assistantVoiceId: sanitizeVoiceId(record.assistantVoiceId),
    speakerVoiceIds: sanitizeSpeakerVoiceIds(record.speakerVoiceIds),
  };
};

export const settingsFileId = (userId) => {
  const id = String(userId || '').trim().replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '').slice(0, 80);
  return id;
};

export const createUserSettingsStore = ({directory} = {}) => {
  const root = resolve(directory || resolve(process.cwd(), 'data/settings'));

  const fileFor = (userId) => {
    const id = settingsFileId(userId);
    if (!id) throw new Error('Нет идентификатора участника.');
    return resolve(root, `${id}.json`);
  };

  return {
    async read(userId) {
      try {
        const raw = await readFile(fileFor(userId), 'utf8');
        return normalizeUserSettings(JSON.parse(raw));
      } catch (error) {
        if (error && error.code === 'ENOENT') return emptyUserSettings();
        return emptyUserSettings();
      }
    },
    async write(userId, value) {
      const settings = normalizeUserSettings(value);
      await mkdir(root, {recursive: true, mode: 0o700});
      const target = fileFor(userId);
      const payload = `${JSON.stringify({
        ...settings,
        updatedAt: new Date().toISOString(),
      }, null, 2)}\n`;
      await writeFile(target, payload, {encoding: 'utf8', mode: 0o600});
      return settings;
    },
  };
};
