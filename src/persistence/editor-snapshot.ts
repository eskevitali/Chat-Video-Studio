import type {AudioTake, ElevenLabsSettings, MessageImage, ProjectTheme, PrototypeMessage, PrototypeProject, VideoSettings, WordTiming} from '../domain/types';

export const EDITOR_SNAPSHOT_FORMAT = 'chat-video-editor-snapshot';
export const EDITOR_SNAPSHOT_VERSION = 1;

export type EditorSnapshot = {
  format: typeof EDITOR_SNAPSHOT_FORMAT;
  version: typeof EDITOR_SNAPSHOT_VERSION;
  savedAt: string;
  project: PrototypeProject;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isWordTiming = (value: unknown): value is WordTiming =>
  isRecord(value)
  && typeof value.text === 'string'
  && isFiniteNonNegative(value.startMs)
  && isFiniteNonNegative(value.endMs)
  && value.endMs >= value.startMs;

const isAudioTake = (value: unknown): value is AudioTake =>
  isRecord(value)
  && typeof value.id === 'string'
  && value.id.length > 0
  && (value.audioPath === undefined || typeof value.audioPath === 'string')
  && isFiniteNonNegative(value.durationMs)
  && Array.isArray(value.words)
  && value.words.every(isWordTiming)
  && (value.sourceText === undefined || typeof value.sourceText === 'string')
  && (value.createdAt === undefined || typeof value.createdAt === 'string')
  && (value.alignment === undefined || value.alignment === 'provider' || value.alignment === 'whisper' || value.alignment === 'approximate');

const isMessageImage = (value: unknown): value is MessageImage =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.path === 'string'
  && typeof value.fileName === 'string'
  && typeof value.width === 'number'
  && value.width > 0
  && typeof value.height === 'number'
  && value.height > 0
  && (value.fit === 'contain' || value.fit === 'cover')
  && (value.position === 'before-text' || value.position === 'after-text')
  && (value.reveal === 'bubble' || value.reveal === 'speech' || value.reveal === 'after-text');

const isMessage = (value: unknown): value is PrototypeMessage =>
  isRecord(value)
  && typeof value.id === 'string'
  && value.id.length > 0
  && (value.role === 'user' || value.role === 'assistant')
  && typeof value.author === 'string'
  && typeof value.text === 'string'
  && isFiniteNonNegative(value.prePauseMs)
  && isFiniteNonNegative(value.typingDurationMs)
  && isFiniteNonNegative(value.postPauseMs)
  && isAudioTake(value.take)
  && (value.takes === undefined || (Array.isArray(value.takes) && value.takes.every(isAudioTake)))
  && (value.attachments === undefined || (Array.isArray(value.attachments) && value.attachments.every(isMessageImage)));

const isHexColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

const isProjectTheme = (value: unknown): value is ProjectTheme =>
  isRecord(value)
  && (value.presetId === 'neutral' || value.presetId === 'chatgpt' || value.presetId === 'gemini')
  && (value.canvas === undefined || isHexColor(value.canvas))
  && (value.chatBackground === undefined || isHexColor(value.chatBackground))
  && (value.accent === undefined || isHexColor(value.accent))
  && (value.userBubble === undefined || isHexColor(value.userBubble))
  && (value.assistantBubble === undefined || isHexColor(value.assistantBubble))
  && (value.chatTitle === undefined || typeof value.chatTitle === 'string')
  && (value.chatSubtitle === undefined || typeof value.chatSubtitle === 'string');

const isVideoSettings = (value: unknown): value is VideoSettings =>
  isRecord(value)
  && (value.format === 'portrait' || value.format === 'landscape' || value.format === 'square')
  && typeof value.uiScale === 'number'
  && value.uiScale >= 0.7
  && value.uiScale <= 1.4
  && typeof value.typingSpeed === 'number'
  && value.typingSpeed >= 0.5
  && value.typingSpeed <= 2;

const isElevenLabsSettings = (value: unknown): value is ElevenLabsSettings =>
  isRecord(value)
  && (value.modelId === 'eleven_v3' || value.modelId === 'eleven_multilingual_v2' || value.modelId === 'eleven_flash_v2_5' || value.modelId === 'eleven_turbo_v2_5')
  && (value.userVoiceId === undefined || (typeof value.userVoiceId === 'string' && value.userVoiceId.length <= 100))
  && (value.assistantVoiceId === undefined || (typeof value.assistantVoiceId === 'string' && value.assistantVoiceId.length <= 100));

const isProject = (value: unknown): value is PrototypeProject =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.fps === 'number'
  && Number.isFinite(value.fps)
  && value.fps > 0
  && (value.theme === undefined || isProjectTheme(value.theme))
  && (value.video === undefined || isVideoSettings(value.video))
  && (value.ttsProvider === undefined || value.ttsProvider === 'elevenlabs' || value.ttsProvider === 'xtts')
  && (value.elevenLabs === undefined || isElevenLabsSettings(value.elevenLabs))
  && Array.isArray(value.messages)
  && value.messages.length > 0
  && value.messages.every(isMessage);

export const createEditorSnapshot = (project: PrototypeProject): EditorSnapshot => ({
  format: EDITOR_SNAPSHOT_FORMAT,
  version: EDITOR_SNAPSHOT_VERSION,
  savedAt: new Date().toISOString(),
  project,
});

export const serializeEditorSnapshot = (project: PrototypeProject): string =>
  JSON.stringify(createEditorSnapshot(project), null, 2);

export const parseEditorSnapshot = (source: string): EditorSnapshot => {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }

  if (!isRecord(value) || value.format !== EDITOR_SNAPSHOT_FORMAT) {
    throw new Error('Это не снимок Chat Video Studio.');
  }
  if (value.version !== EDITOR_SNAPSHOT_VERSION) {
    throw new Error(`Версия снимка ${String(value.version)} пока не поддерживается.`);
  }
  if (typeof value.savedAt !== 'string' || !isProject(value.project)) {
    throw new Error('Структура снимка повреждена или содержит недопустимые значения.');
  }

  return value as EditorSnapshot;
};
