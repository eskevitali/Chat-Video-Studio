import {describe, expect, it} from 'vitest';
import type {PrototypeMessage} from './types';
import {blankMessage, cloneMessage, cloneTakeInMessage, insertMessageAfter, moveMessageBy, reorderMessages} from './messages';

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

describe('message create and clone', () => {
  it('вставляет пустую реплику после выбранной', () => {
    const messages = ['a', 'b'].map(message);
    const added = blankMessage({role: 'assistant', author: 'AI', text: 'Новая'});
    expect(insertMessageAfter(messages, 'a', added).map((item) => item.id)).toEqual(['a', added.id, 'b']);
  });

  it('клонирует реплику с новым id и теми же дублями', () => {
    const source = {
      ...message('a'),
      take: {id: 'take-a', audioPath: 'a.mp3', durationMs: 100, words: []},
      takes: [{id: 'take-a', audioPath: 'a.mp3', durationMs: 100, words: []}],
    };
    const copy = cloneMessage(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.take.id).not.toBe(source.take.id);
    expect(copy.take.audioPath).toBe('a.mp3');
    expect(copy.text).toBe(source.text);
  });

  it('клонирует дубль в историю той же реплики', () => {
    const source = {
      ...message('a'),
      take: {id: 'take-a', audioPath: 'a.mp3', durationMs: 100, words: []},
      takes: [{id: 'take-a', audioPath: 'a.mp3', durationMs: 100, words: []}],
    };
    const next = cloneTakeInMessage(source, 'take-a');
    expect(next.takes).toHaveLength(2);
    expect(next.takes?.[1].id).not.toBe('take-a');
    expect(next.takes?.[1].audioPath).toBe('a.mp3');
    expect(next.take.id).toBe('take-a');
  });
});
