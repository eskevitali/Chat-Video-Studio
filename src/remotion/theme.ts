import type {ProjectTheme, ThemePresetId} from '../domain/types';

export type ChatTheme = {
  canvas: string;
  browser: string;
  toolbar: string;
  toolbarBorder: string;
  addressBar: string;
  chat: string;
  text: string;
  muted: string;
  userBubble: string;
  assistantBubble: string;
  accent: string;
  brandGradient: string;
  backdropGlow: string;
};

export const themePresets: Record<ThemePresetId, ChatTheme> = {
  neutral: {
  canvas: '#cfd9e8',
  browser: '#ffffff',
  toolbar: '#f7f8fa',
  toolbarBorder: '#e3e7ed',
  addressBar: '#eceff3',
  chat: '#ffffff',
  text: '#1f2937',
  muted: '#667085',
  userBubble: '#e8f0fe',
  assistantBubble: '#f3f4f6',
  accent: '#2563eb',
    brandGradient: 'linear-gradient(135deg, #2563eb, #8b5cf6)',
    backdropGlow: '#edf3ff',
  },
  chatgpt: {
    canvas: '#cad4d1',
    browser: '#ffffff',
    toolbar: '#f7f7f8',
    toolbarBorder: '#e5e5e5',
    addressBar: '#ececec',
    chat: '#ffffff',
    text: '#202123',
    muted: '#6e6e80',
    userBubble: '#e9e9e9',
    assistantBubble: '#ffffff',
    accent: '#10a37f',
    brandGradient: 'linear-gradient(135deg, #10a37f, #087f67)',
    backdropGlow: '#e7f4f0',
  },
  gemini: {
    canvas: '#cbd6ea',
    browser: '#ffffff',
    toolbar: '#f8fafd',
    toolbarBorder: '#e1e5eb',
    addressBar: '#edf2fa',
    chat: '#ffffff',
    text: '#1f1f1f',
    muted: '#5f6368',
    userBubble: '#e9eef6',
    assistantBubble: '#f8fafd',
    accent: '#1a73e8',
    brandGradient: 'linear-gradient(135deg, #4285f4, #9b72cb 55%, #d96570)',
    backdropGlow: '#e8f0fe',
  },
};

export const defaultProjectTheme: ProjectTheme = {
  presetId: 'neutral',
  chatTitle: 'Новый диалог',
  chatSubtitle: 'Симулятор чата',
};

export const resolveTheme = (settings?: ProjectTheme): ChatTheme => {
  const selected = settings ?? defaultProjectTheme;
  const preset = themePresets[selected.presetId] ?? themePresets.neutral;
  return {
    ...preset,
    canvas: selected.canvas || preset.canvas,
    chat: selected.chatBackground || preset.chat,
    accent: selected.accent || preset.accent,
    userBubble: selected.userBubble || preset.userBubble,
    assistantBubble: selected.assistantBubble || preset.assistantBubble,
  };
};

export const lightTheme = themePresets.neutral;
