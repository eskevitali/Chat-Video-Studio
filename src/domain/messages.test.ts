import {describe, expect, it} from 'vitest';
import type {PrototypeMessage} from './types';
import {moveMessageBy, reorderMessages} from './messages';

const message = (id: string): PrototypeMessage => ({
  id,
  role: 'user',
  author: id,
  text: id,
  prePauseMs: 0,
  typingDurationMs: 0,
  postPauseMs: 0,
  take: {id: `take-${id}`, durationMs: 100, words: []},
});

describe('message ordering', () => {
  it('перетаскивает реплику на позицию другой реплики', () => {
    expect(reorderMessages(['a', 'b', 'c'].map(message), 'a', 'c').map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('перемещает реплику на один шаг и не выходит за границы', () => {
    const messages = ['a', 'b', 'c'].map(message);
    expect(moveMessageBy(messages, 'b', -1).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveMessageBy(messages, 'a', -1)).toBe(messages);
  });
});
