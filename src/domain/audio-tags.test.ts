import {describe, expect, it} from 'vitest';
import {applyAudioTag, filterAudioTags, incompleteTagAt} from './audio-tags';

describe('audio tag autocomplete', () => {
  it('находит незакрытый тег у курсора', () => {
    expect(incompleteTagAt('[whi', 4)).toEqual({start: 0, query: 'whi'});
    expect(incompleteTagAt('Текст [sad] дальше [', 20)).toEqual({start: 19, query: ''});
    expect(incompleteTagAt('[sad] готово', 5)).toBeNull();
  });

  it('фильтрует по тегу и по русской подсказке', () => {
    expect(filterAudioTags('whis').map((item) => item.tag)).toEqual(['whispers', 'almost whispering']);
    expect(filterAudioTags('шёп').map((item) => item.tag)).toEqual(['whispers', 'almost whispering']);
  });

  it('подставляет полный тег вместо недописанного', () => {
    expect(applyAudioTag('Привет [whi', 11, 'whispers')).toEqual({
      text: 'Привет [whispers] ',
      caret: 18,
    });
  });
});
