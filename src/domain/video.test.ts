import {describe, expect, it} from 'vitest';
import {getVideoDimensions, resolveVideoSettings} from './video';

describe('video settings', () => {
  it('возвращает вертикальные настройки по умолчанию', () => {
    expect(resolveVideoSettings()).toEqual({format: 'portrait', uiScale: 1, typingSpeed: 1});
    expect(getVideoDimensions()).toMatchObject({width: 1080, height: 1920});
  });

  it('выбирает размеры горизонтального и квадратного кадра', () => {
    expect(getVideoDimensions({format: 'landscape', uiScale: 1, typingSpeed: 1})).toMatchObject({width: 1920, height: 1080});
    expect(getVideoDimensions({format: 'square', uiScale: 1, typingSpeed: 1})).toMatchObject({width: 1080, height: 1080});
  });
});
