import {describe, expect, it} from 'vitest';
import {resolveTheme, themePresets} from './theme';

describe('chat themes', () => {
  it('выбирает пресет и применяет пользовательские цвета поверх него', () => {
    const theme = resolveTheme({
      presetId: 'gemini',
      canvas: '#112233',
      chatBackground: '#445566',
      accent: '#123456',
    });
    expect(theme.canvas).toBe('#112233');
    expect(theme.chat).toBe('#445566');
    expect(theme.accent).toBe('#123456');
    expect(theme.userBubble).toBe(themePresets.gemini.userBubble);
    expect(theme.brandGradient).toBe(themePresets.gemini.brandGradient);
  });

  it('использует нейтральную тему для старого проекта без настроек', () => {
    expect(resolveTheme()).toEqual(themePresets.neutral);
  });
});
