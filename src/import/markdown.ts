import type {PrototypeMessage, PrototypeProject, Role} from '../domain/types';
import {createApproximateWordTimings, estimateSpeechDuration} from '../domain/words';

export type ImportedChat = {
  title: string;
  messages: Array<{author: string; role: Role; text: string}>;
};

const normalizeAuthor = (author: string) => author.trim().replace(/:$/, '');

const roleForAuthor = (author: string): Role => {
  const value = author.toLocaleLowerCase('ru-RU');
  if (/^(пользователь|user|human|вы|you)(\s*\d+)?$/.test(value)) return 'user';
  return 'assistant';
};

const cleanContent = (value: string) => value
  .replace(/^>\s*Экспортировано[^\n]*\n+/i, '')
  .trim();

export const parseMarkdownChat = (markdown: string): ImportedChat => {
  const normalized = markdown.replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new Error('Markdown-файл пуст.');

  const title = (normalized.match(/^#\s+(.+)$/m)?.[1] || 'Импортированный диалог').trim();
  const blocks = normalized.split(/^\s*---\s*$/m);
  const messages: ImportedChat['messages'] = [];

  for (const block of blocks) {
    const heading = block.match(/^##\s+(.+)$/m);
    if (!heading || heading.index === undefined) continue;
    const author = normalizeAuthor(heading[1]);
    const afterHeading = block.slice(heading.index + heading[0].length);
    const text = cleanContent(afterHeading);
    if (text) messages.push({author, role: roleForAuthor(author), text});
  }

  if (!messages.length) {
    throw new Error('Реплики не найдены. Ожидаются заголовки вида «## Пользователь» и разделители «---».');
  }
  return {title, messages};
};

export const importedChatToProject = (chat: ImportedChat): PrototypeProject => ({
  title: chat.title,
  fps: 30,
  messages: chat.messages.map((message, index): PrototypeMessage => {
    const durationMs = estimateSpeechDuration(message.text);
    return {
      id: `imported-message-${index + 1}`,
      role: message.role,
      author: message.author,
      text: message.text,
      prePauseMs: 280,
      typingDurationMs: message.role === 'user' ? 550 : 750,
      postPauseMs: 420,
      take: {
        id: `placeholder-take-${index + 1}`,
        durationMs,
        words: createApproximateWordTimings(message.text, durationMs),
      },
      takes: [],
    };
  }),
});
