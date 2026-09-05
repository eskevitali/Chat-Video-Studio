import {describe, expect, it} from 'vitest';
import {BUBBLE_AUDIO_LEAD_MS, compileTimeline, millisecondsToFrame, visibleTextAt} from './timeline';
import type {PrototypeProject} from './types';

const project: PrototypeProject = {
  title: 'Test',
  fps: 30,
  messages: [
    {
      id: 'one', role: 'user', author: 'User', text: 'Hello world',
      prePauseMs: 100, typingDurationMs: 200, postPauseMs: 300,
      take: {
        id: 'take-one', audioPath: 'one.wav', durationMs: 1000,
        words: [
          {text: 'Hello', startMs: 0, endMs: 400},
          {text: 'world', startMs: 500, endMs: 900},
        ],
      },
    },
    {
      id: 'two', role: 'assistant', author: 'AI', text: 'Done',
      prePauseMs: 50, typingDurationMs: 100, postPauseMs: 200,
      take: {
        id: 'take-two', audioPath: 'two.wav', durationMs: 500,
        words: [{text: 'Done', startMs: 0, endMs: 450}],
      },
    },
  ],
};

describe('compileTimeline', () => {
  it('компилирует последовательные сообщения без перекрытия', () => {
    const timeline = compileTimeline(project);
    expect(timeline.messages[0].speechStartMs).toBe(800);
    expect(timeline.messages[0].speechStartMs - timeline.messages[0].bubbleStartMs).toBe(BUBBLE_AUDIO_LEAD_MS);
    expect(timeline.messages[0].endMs).toBe(2100);
    expect(timeline.messages[1].startMs).toBe(2100);
    expect(timeline.durationInFrames).toBe(millisecondsToFrame(3450, 30));
  });

  it('раскрывает текст по временным отметкам слов', () => {
    const [message] = compileTimeline(project).messages;
    expect(visibleTextAt(message, 799)).toBe('');
    expect(visibleTextAt(message, 800)).toBe('Hello');
    expect(visibleTextAt(message, 1300)).toBe('Hello world');
  });

  it('пересчитывает последующие сообщения при замене дубля', () => {
    const longer = structuredClone(project);
    longer.messages[0].take.durationMs = 1500;
    const timeline = compileTimeline(longer);
    expect(timeline.messages[1].startMs).toBe(2600);
  });

  it('не показывает audio tags в тексте пузыря', () => {
    const tagged = structuredClone(project);
    tagged.messages[0].text = '[whispers] Hello world';
    tagged.messages[0].take.words = [
      {text: '[whispers]', startMs: 0, endMs: 180},
      {text: 'Hello', startMs: 200, endMs: 400},
      {text: 'world', startMs: 500, endMs: 900},
    ];
    const [message] = compileTimeline(tagged).messages;
    expect(visibleTextAt(message, message.speechStartMs + 199)).toBe('');
    expect(visibleTextAt(message, message.speechStartMs + 200)).toBe('Hello');
    expect(visibleTextAt(message, message.speechStartMs + 500)).toBe('Hello world');
  });

  it('ускоряет индикатор набора, не меняя длительность аудио', () => {
    const faster = structuredClone(project);
    faster.video = {format: 'portrait', uiScale: 1, typingSpeed: 2};
    const timeline = compileTimeline(faster);
    expect(timeline.messages[0].bubbleStartMs).toBe(200);
    expect(timeline.messages[0].speechEndMs - timeline.messages[0].speechStartMs).toBe(1000);
  });
});
