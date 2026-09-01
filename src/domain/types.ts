export type Role = 'user' | 'assistant';

export type ThemePresetId = 'neutral' | 'chatgpt' | 'gemini';

export type ProjectTheme = {
  presetId: ThemePresetId;
  canvas?: string;
  chatBackground?: string;
  accent?: string;
  userBubble?: string;
  assistantBubble?: string;
  chatTitle?: string;
  chatSubtitle?: string;
};

export type VideoFormat = 'portrait' | 'landscape' | 'square';

export type VideoSettings = {
  format: VideoFormat;
  uiScale: number;
  typingSpeed: number;
};

export type TtsProvider = 'elevenlabs' | 'xtts';

export type ElevenLabsModelId = 'eleven_multilingual_v2' | 'eleven_flash_v2_5' | 'eleven_turbo_v2_5';

export type ElevenLabsSettings = {
  modelId: ElevenLabsModelId;
  userVoiceId?: string;
  assistantVoiceId?: string;
};

export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export type AudioTake = {
  id: string;
  audioPath?: string;
  durationMs: number;
  words: WordTiming[];
  sourceText?: string;
  createdAt?: string;
  alignment?: 'provider' | 'whisper' | 'approximate';
};

export type MessageImage = {
  id: string;
  path: string;
  fileName: string;
  width: number;
  height: number;
  fit: 'contain' | 'cover';
  position: 'before-text' | 'after-text';
  reveal: 'bubble' | 'speech' | 'after-text';
};

export type PrototypeMessage = {
  id: string;
  role: Role;
  author: string;
  text: string;
  prePauseMs: number;
  typingDurationMs: number;
  postPauseMs: number;
  take: AudioTake;
  takes?: AudioTake[];
  attachments?: MessageImage[];
};

export type PrototypeProject = {
  title: string;
  fps: number;
  theme?: ProjectTheme;
  video?: VideoSettings;
  ttsProvider?: TtsProvider;
  elevenLabs?: ElevenLabsSettings;
  messages: PrototypeMessage[];
};

export type CompiledWord = WordTiming & {
  visibleFromMs: number;
};

export type CompiledMessage = PrototypeMessage & {
  startMs: number;
  typingStartMs: number;
  bubbleStartMs: number;
  speechStartMs: number;
  speechEndMs: number;
  endMs: number;
  words: CompiledWord[];
};

export type CompiledTimeline = {
  fps: number;
  durationMs: number;
  durationInFrames: number;
  messages: CompiledMessage[];
};
