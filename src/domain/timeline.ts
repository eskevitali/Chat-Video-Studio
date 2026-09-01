import type {CompiledTimeline, PrototypeProject} from './types';
import {resolveVideoSettings} from './video';

export const BUBBLE_AUDIO_LEAD_MS = 500;

export const millisecondsToFrame = (milliseconds: number, fps: number) =>
  Math.round((milliseconds * fps) / 1000);

export const frameToMilliseconds = (frame: number, fps: number) =>
  (frame * 1000) / fps;

export const compileTimeline = (project: PrototypeProject): CompiledTimeline => {
  if (project.fps <= 0) throw new Error('FPS должен быть положительным.');

  let cursorMs = 0;
  const {typingSpeed} = resolveVideoSettings(project.video);
  const messages = project.messages.map((message) => {
    if (message.take.durationMs <= 0) {
      throw new Error(`У реплики ${message.id} некорректная длительность аудио.`);
    }

    const startMs = cursorMs;
    const typingStartMs = startMs + message.prePauseMs;
    const bubbleStartMs = typingStartMs + message.typingDurationMs / typingSpeed;
    const speechStartMs = bubbleStartMs + BUBBLE_AUDIO_LEAD_MS;
    const speechEndMs = speechStartMs + message.take.durationMs;
    const endMs = speechEndMs + message.postPauseMs;

    const words = message.take.words.map((word) => ({
      ...word,
      visibleFromMs: speechStartMs + word.startMs,
    }));

    cursorMs = endMs;
    return {
      ...message,
      startMs,
      typingStartMs,
      bubbleStartMs,
      speechStartMs,
      speechEndMs,
      endMs,
      words,
    };
  });

  return {
    fps: project.fps,
    durationMs: cursorMs,
    durationInFrames: Math.max(1, millisecondsToFrame(cursorMs, project.fps)),
    messages,
  };
};

export const visibleTextAt = (
  message: CompiledTimeline['messages'][number],
  timeMs: number,
) => message.words
  .filter((word) => timeMs >= word.visibleFromMs)
  .map((word) => word.text)
  .join(' ');
