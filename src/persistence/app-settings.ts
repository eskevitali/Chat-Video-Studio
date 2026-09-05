export const APP_SETTINGS_KEY = 'chat-video-studio.app-settings.v1';

export type AppSettings = {
  apiKey: string;
  userVoiceId: string;
  assistantVoiceId: string;
  speakerVoiceIds: Record<string, string>;
};

export const defaultAppSettings: AppSettings = {
  apiKey: '',
  userVoiceId: '',
  assistantVoiceId: '',
  speakerVoiceIds: {},
};

export const sanitizeVoiceId = (value: unknown): string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.trim()) ? value.trim() : '';

export const sanitizeApiKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\r\n]/.test(trimmed)) return '';
  return trimmed;
};

export const parseAppSettings = (raw: string | null | undefined): AppSettings => {
  if (!raw) return {...defaultAppSettings};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {...defaultAppSettings};
    const record = value as Record<string, unknown>;
    return {
      apiKey: sanitizeApiKey(record.apiKey),
      userVoiceId: sanitizeVoiceId(record.userVoiceId),
      assistantVoiceId: sanitizeVoiceId(record.assistantVoiceId),
      speakerVoiceIds: sanitizeSpeakerVoiceIds(record.speakerVoiceIds),
    };
  } catch {
    return {...defaultAppSettings};
  }
};

export const sanitizeSpeakerVoiceIds = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const id = key.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
    const voiceId = sanitizeVoiceId(raw);
    if (id && voiceId) result[id] = voiceId;
  }
  return result;
};

export const serializeAppSettings = (settings: AppSettings): string =>
  JSON.stringify({
    apiKey: sanitizeApiKey(settings.apiKey),
    userVoiceId: sanitizeVoiceId(settings.userVoiceId),
    assistantVoiceId: sanitizeVoiceId(settings.assistantVoiceId),
    speakerVoiceIds: sanitizeSpeakerVoiceIds(settings.speakerVoiceIds),
  });

export const loadAppSettings = (): AppSettings => {
  try {
    return parseAppSettings(window.localStorage.getItem(APP_SETTINGS_KEY));
  } catch {
    return {...defaultAppSettings};
  }
};

export const saveAppSettings = (settings: AppSettings): void => {
  window.localStorage.setItem(APP_SETTINGS_KEY, serializeAppSettings(settings));
};
