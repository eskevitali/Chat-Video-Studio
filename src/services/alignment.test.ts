import {describe, expect, it} from 'vitest';
import {characterAlignmentToWords} from './alignment';

describe('characterAlignmentToWords', () => {
  it('группирует символы в слова и сохраняет пунктуацию', () => {
    expect(characterAlignmentToWords({
      characters: ['П', 'р', 'и', 'в', 'е', 'т', ',', ' ', 'м', 'и', 'р', '!'],
      character_start_times_seconds: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1, 1.1],
      character_end_times_seconds: [.1, .2, .3, .4, .5, .6, .7, .8, .9, 1, 1.1, 1.2],
    })).toEqual([
      {text: 'Привет,', startMs: 0, endMs: 700},
      {text: 'мир!', startMs: 800, endMs: 1200},
    ]);
  });

  it('отклоняет повреждённые массивы', () => {
    expect(() => characterAlignmentToWords({
      characters: ['a'],
      character_start_times_seconds: [],
      character_end_times_seconds: [],
    })).toThrow(/несогласованные/);
  });
});
