import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {createUserSettingsStore, normalizeUserSettings, settingsFileId} from './user-settings.mjs';

describe('user settings store', () => {
  it('нормализует ключ и Voice ID', () => {
    expect(normalizeUserSettings({
      apiKey: '  sk_live  ',
      userVoiceId: 'Voice_1',
      assistantVoiceId: 'bad voice',
    })).toEqual({
      apiKey: 'sk_live',
      userVoiceId: 'Voice_1',
      assistantVoiceId: '',
    });
    expect(settingsFileId('../etc/passwd')).toBe('etcpasswd');
  });

  it('пишет и читает настройки по идентификатору участника', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vchat-settings-'));
    const store = createUserSettingsStore({directory: root});
    await expect(store.read('user-1')).resolves.toEqual({
      apiKey: '',
      userVoiceId: '',
      assistantVoiceId: '',
    });
    await store.write('user-1', {
      apiKey: 'sk_a',
      userVoiceId: 'aaa',
      assistantVoiceId: 'bbb',
    });
    await expect(store.read('user-1')).resolves.toEqual({
      apiKey: 'sk_a',
      userVoiceId: 'aaa',
      assistantVoiceId: 'bbb',
    });
    await expect(store.read('user-2')).resolves.toMatchObject({apiKey: ''});
    await rm(root, {recursive: true, force: true});
  });
});
