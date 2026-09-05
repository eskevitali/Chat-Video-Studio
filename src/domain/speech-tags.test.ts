import {describe, expect, it} from 'vitest';
import {displayWords, isSpeechMarkupToken, stripSpeechMarkup} from './speech-tags';

describe('speech tags', () => {
  it('убирает audio tags и SSML break из текста на экране', () => {
    expect(stripSpeechMarkup('[whispers] Это секрет.')).toBe('Это секрет.');
    expect(stripSpeechMarkup('[sighs] Я так и думал. [laughs]')).toBe('Я так и думал.');
    expect(stripSpeechMarkup('Подожди. <break time="1.5s" /> Дальше.')).toBe('Подожди. Дальше.');
    expect(stripSpeechMarkup('[strong French accent] Bonjour')).toBe('Bonjour');
  });

  it('не трогает обычный текст и не глотает скобки в словах без тега', () => {
    expect(stripSpeechMarkup('Цена 10 (руб.) ок')).toBe('Цена 10 (руб.) ок');
    expect(stripSpeechMarkup('Просто фраза.')).toBe('Просто фраза.');
  });

  it('выкидывает слова-теги из таймингов', () => {
    expect(isSpeechMarkupToken('[whispers]')).toBe(true);
    expect(displayWords([
      {text: '[whispers]', startMs: 0, endMs: 200},
      {text: 'Hello', startMs: 200, endMs: 500},
    ])).toEqual([{text: 'Hello', startMs: 200, endMs: 500}]);
  });
});
