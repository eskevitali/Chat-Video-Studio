import {describe, expect, it} from 'vitest';
import {nextUserSpeaker, resolveSpeakers, speakerIdOf, speakerOf} from './speakers';
import type {PrototypeMessage} from './types';

const message = (role: PrototypeMessage['role'], speakerId?: string): PrototypeMessage => ({
  id: 'm',
  role,
  speakerId,
  author: role,
  text: 'x',
  prePauseMs: 0,
  typingDurationMs: 0,
  postPauseMs: 0,
  take: {id: 't', durationMs: 100, words: []},
});

describe('speakers', () => {
  it('по умолчанию даёт пользователя справа и ассистента слева', () => {
    const speakers = resolveSpeakers({messages: [message('user'), message('assistant')]});
    expect(speakers.map((item) => item.id)).toEqual(['user', 'assistant']);
    expect(speakerIdOf(message('user'))).toBe('user');
    expect(speakerOf(message('assistant'), speakers).role).toBe('assistant');
  });

  it('добавляет следующего пользователя справа', () => {
    const speakers = resolveSpeakers({messages: [message('user')]});
    const extra = nextUserSpeaker(speakers);
    expect(extra.role).toBe('user');
    expect(extra.name).toBe('Пользователь 2');
    expect(extra.id).toBe('user-2');
  });
});
