import type {PrototypeProject} from '../domain/types';
import elevenLabsUser from './elevenlabs-user.generated.json';
import elevenLabsAssistant from './elevenlabs-assistant.generated.json';
import {createApproximateWordTimings} from '../domain/words';

const firstText = 'Как превратить сохранённый диалог в готовое видео?';
const secondText = 'Приложение создаёт виртуальное окно браузера, озвучивает реплики и показывает каждое слово синхронно с голосом. Когда активное сообщение становится длиннее видимой области, чат плавно прокручивается вниз.';

export const prototypeProject: PrototypeProject = {
  title: 'Chat Video Studio',
  fps: 30,
  theme: {
    presetId: 'neutral',
    chatTitle: 'Новый диалог',
    chatSubtitle: '',
  },
  video: {format: 'portrait', uiScale: 1, typingSpeed: 1},
  ttsProvider: 'elevenlabs',
  messages: [
    {
      id: 'msg-user',
      role: 'user',
      author: 'Пользователь',
      text: firstText,
      prePauseMs: 350,
      typingDurationMs: 650,
      postPauseMs: 500,
      take: {
        id: 'take-user-1',
        audioPath: elevenLabsUser.audioPath,
        durationMs: elevenLabsUser.durationMs,
        words: elevenLabsUser.words.length ? elevenLabsUser.words : createApproximateWordTimings(firstText, 3400),
        sourceText: firstText,
      },
    },
    {
      id: 'msg-assistant',
      role: 'assistant',
      author: 'ИИ-ассистент',
      text: secondText,
      prePauseMs: 300,
      typingDurationMs: 900,
      postPauseMs: 900,
      take: {
        id: 'take-assistant-1',
        audioPath: elevenLabsAssistant.audioPath,
        durationMs: elevenLabsAssistant.durationMs,
        words: elevenLabsAssistant.words.length ? elevenLabsAssistant.words : createApproximateWordTimings(secondText, 11500),
        sourceText: secondText,
      },
    },
  ],
};
