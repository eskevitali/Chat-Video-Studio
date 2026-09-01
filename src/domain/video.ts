import type {VideoFormat, VideoSettings} from './types';

export const defaultVideoSettings: VideoSettings = {
  format: 'portrait',
  uiScale: 1,
  typingSpeed: 1,
};

export const videoDimensions: Record<VideoFormat, {width: number; height: number; label: string}> = {
  portrait: {width: 1080, height: 1920, label: 'Вертикальное · 9:16'},
  landscape: {width: 1920, height: 1080, label: 'Горизонтальное · 16:9'},
  square: {width: 1080, height: 1080, label: 'Квадратное · 1:1'},
};

export const resolveVideoSettings = (settings?: VideoSettings): VideoSettings => ({
  ...defaultVideoSettings,
  ...settings,
});

export const getVideoDimensions = (settings?: VideoSettings) =>
  videoDimensions[resolveVideoSettings(settings).format];
