import {describe, expect, it} from 'vitest';
import {prototypeProject} from '../data/prototype-project';
import {parseEditorSnapshot, serializeEditorSnapshot} from './editor-snapshot';

describe('editor snapshot', () => {
  it('сохраняет и восстанавливает проект вместе с дублями', () => {
    const projectWithHistory = {
      ...prototypeProject,
      messages: prototypeProject.messages.map((message, index) => index === 0
        ? {...message, takes: [message.take]}
        : message),
    };
    const restored = parseEditorSnapshot(serializeEditorSnapshot(projectWithHistory));
    expect(restored.version).toBe(1);
    expect(restored.project).toEqual(projectWithHistory);
    expect(restored.project.messages[0].takes).toHaveLength(1);
  });

  it('объясняет ошибку синтаксиса JSON', () => {
    expect(() => parseEditorSnapshot('{')).toThrow(/корректным JSON/);
  });

  it('отклоняет неизвестную версию и повреждённый проект', () => {
    const snapshot = JSON.parse(serializeEditorSnapshot(prototypeProject));
    snapshot.version = 2;
    expect(() => parseEditorSnapshot(JSON.stringify(snapshot))).toThrow(/не поддерживается/);

    snapshot.version = 1;
    snapshot.project.fps = 0;
    expect(() => parseEditorSnapshot(JSON.stringify(snapshot))).toThrow(/повреждена/);
  });

  it('читает старый снимок без темы, но отклоняет некорректный цвет', () => {
    const snapshot = JSON.parse(serializeEditorSnapshot(prototypeProject));
    delete snapshot.project.theme;
    expect(parseEditorSnapshot(JSON.stringify(snapshot)).project.theme).toBeUndefined();

    snapshot.project.theme = {presetId: 'neutral', accent: 'blue'};
    expect(() => parseEditorSnapshot(JSON.stringify(snapshot))).toThrow(/повреждена/);
  });

  it('сохраняет цвета основного фона и подложки чата', () => {
    const project = {
      ...prototypeProject,
      theme: {...prototypeProject.theme!, canvas: '#112233', chatBackground: '#445566'},
    };
    expect(parseEditorSnapshot(serializeEditorSnapshot(project)).project.theme).toMatchObject({
      canvas: '#112233',
      chatBackground: '#445566',
    });
  });

  it('проверяет границы настроек видеокадра', () => {
    const snapshot = JSON.parse(serializeEditorSnapshot(prototypeProject));
    snapshot.project.video.uiScale = 4;
    expect(() => parseEditorSnapshot(JSON.stringify(snapshot))).toThrow(/повреждена/);
  });

  it('сохраняет выбранный TTS-провайдер и отклоняет неизвестный', () => {
    const snapshot = JSON.parse(serializeEditorSnapshot({...prototypeProject, ttsProvider: 'xtts'}));
    expect(parseEditorSnapshot(JSON.stringify(snapshot)).project.ttsProvider).toBe('xtts');
    snapshot.project.ttsProvider = 'unknown';
    expect(() => parseEditorSnapshot(JSON.stringify(snapshot))).toThrow(/повреждена/);
  });

  it('сохраняет модель ElevenLabs и идентификаторы голосов', () => {
    const project = {
      ...prototypeProject,
      elevenLabs: {
        modelId: 'eleven_flash_v2_5' as const,
        userVoiceId: 'voice-user',
        assistantVoiceId: 'voice-assistant',
      },
    };
    expect(parseEditorSnapshot(serializeEditorSnapshot(project)).project.elevenLabs).toEqual(project.elevenLabs);
  });

  it('сохраняет вложенные изображения реплик', () => {
    const image = {
      id: 'image-1',
      path: 'uploads/msg-user/image-1.webp',
      fileName: 'example.webp',
      width: 1200,
      height: 800,
      fit: 'contain' as const,
      position: 'before-text' as const,
      reveal: 'speech' as const,
    };
    const project = {
      ...prototypeProject,
      messages: prototypeProject.messages.map((message, index) => index === 0 ? {...message, attachments: [image]} : message),
    };
    expect(parseEditorSnapshot(serializeEditorSnapshot(project)).project.messages[0].attachments).toEqual([image]);
  });
});
