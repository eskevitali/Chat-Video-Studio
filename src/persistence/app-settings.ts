export const APP_SETTINGS_KEY = 'chat-video-studio.app-settings.v1';

export type AppSettings = {
  apiKey: string;
  userVoiceId: string;
  assistantVoiceId: string;
};

export const defaultAppSettings: AppSettings = {
  apiKey: '',
  userVoiceId: '',
  assistantVoiceId: '',
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
    };
  } catch {
    return {...defaultAppSettings};
  }
};

export const serializeAppSettings = (settings: AppSettings): string =>
  JSON.stringify({
    apiKey: sanitizeApiKey(settings.apiKey),
    userVoiceId: sanitizeVoiceId(settings.userVoiceId),
    assistantVoiceId: sanitizeVoiceId(settings.assistantVoiceId),
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
