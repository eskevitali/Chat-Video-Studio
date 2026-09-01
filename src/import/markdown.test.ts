import {describe, expect, it} from 'vitest';
import {importedChatToProject, parseMarkdownChat} from './markdown';

const exported = `# Тестовый чат

> Экспортировано из ChatGPT: 2026-08-31

## Пользователь

Первый вопрос.

---

## ChatGPT

Ответ с **выделением**.

## Подзаголовок внутри ответа

Продолжение ответа.
`;

describe('parseMarkdownChat', () => {
  it('извлекает название, роли и не путает внутренний заголовок с репликой', () => {
    const chat = parseMarkdownChat(exported);
    expect(chat.title).toBe('Тестовый чат');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({role: 'user', author: 'Пользователь', text: 'Первый вопрос.'});
    expect(chat.messages[1].text).toContain('## Подзаголовок внутри ответа');
  });

  it('создаёт беззвучный редактируемый проект с приблизительными таймингами', () => {
    const project = importedChatToProject(parseMarkdownChat(exported));
    expect(project.messages[0].take.audioPath).toBeUndefined();
    expect(project.messages[1].take.words.length).toBeGreaterThan(2);
  });

  it('отклоняет файл без реплик', () => {
    expect(() => parseMarkdownChat('# Только заголовок')).toThrow(/Реплики не найдены/);
  });
});
