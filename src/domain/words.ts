import type {WordTiming} from './types';

export const createApproximateWordTimings = (text: string, durationMs: number): WordTiming[] => {
  const parts = text.split(/\s+/u).filter(Boolean);
  if (!parts.length) return [];
  const weights = parts.map((part) => Math.max(2, part.replace(/[^\p{L}\p{N}]/gu, '').length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return parts.map((part, index) => {
    const slice = (durationMs * weights[index]) / total;
    const startMs = Math.round(cursor);
    cursor += slice;
    return {text: part, startMs, endMs: Math.max(startMs, Math.round(cursor - 35))};
  });
};

export const estimateSpeechDuration = (text: string) =>
  Math.max(900, Math.round(text.trim().length * 72));
