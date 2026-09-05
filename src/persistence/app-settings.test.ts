import {describe, expect, it} from 'vitest';
import {parseAppSettings, sanitizeApiKey, sanitizeVoiceId, serializeAppSettings} from './app-settings';

describe('app settings', () => {
  it('читает ключ и голоса из JSON', () => {
    expect(parseAppSettings(JSON.stringify({
      apiKey: 'sk_test_123',
      userVoiceId: 'voiceUser',
      assistantVoiceId: 'voiceAssistant',
    }))).toEqual({
      apiKey: 'sk_test_123',
      userVoiceId: 'voiceUser',
      assistantVoiceId: 'voiceAssistant',
    });
  });

  it('отбрасывает повреждённый JSON и недопустимые голоса', () => {
    expect(parseAppSettings('{')).toEqual({apiKey: '', userVoiceId: '', assistantVoiceId: ''});
    expect(sanitizeVoiceId('bad voice')).toBe('');
    expect(sanitizeVoiceId('ok_Voice-1')).toBe('ok_Voice-1');
  });

  it('не сериализует переносы строк в ключе', () => {
    expect(sanitizeApiKey('abc\ndef')).toBe('');
    expect(JSON.parse(serializeAppSettings({
      apiKey: 'sk_live',
      userVoiceId: 'aaa',
      assistantVoiceId: 'bbb',
    }))).toEqual({
      apiKey: 'sk_live',
      userVoiceId: 'aaa',
      assistantVoiceId: 'bbb',
    });
  });
});
