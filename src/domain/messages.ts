import type {AudioTake, PrototypeMessage, Role} from './types';
import {createApproximateWordTimings, estimateSpeechDuration} from './words';

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const cloneTakeRecord = (take: AudioTake): AudioTake => ({
  ...take,
  id: newId('take'),
  createdAt: new Date().toISOString(),
});

export const blankMessage = (input: {role: Role; author: string; text?: string}): PrototypeMessage => {
  const text = input.text ?? '';
  const durationMs = estimateSpeechDuration(text || '…');
  return {
    id: newId('msg'),
    role: input.role,
    author: input.author,
    text,
    prePauseMs: 280,
    typingDurationMs: input.role === 'user' ? 550 : 750,
    postPauseMs: 420,
    take: {
      id: newId('take'),
      durationMs,
      words: createApproximateWordTimings(text || '…', durationMs),
      alignment: 'approximate',
    },
    takes: [],
  };
};

export const insertMessageAfter = (
  messages: PrototypeMessage[],
  afterId: string | undefined,
  message: PrototypeMessage,
): PrototypeMessage[] => {
  const index = afterId ? messages.findIndex((item) => item.id === afterId) : messages.length - 1;
  const next = [...messages];
  next.splice(index < 0 ? next.length : index + 1, 0, message);
  return next;
};

export const cloneMessage = (message: PrototypeMessage): PrototypeMessage => {
  const history = message.takes?.length ? message.takes : message.take.audioPath ? [message.take] : [message.take];
  const mapped = history.map((take) => ({oldId: take.id, copy: cloneTakeRecord(take)}));
  const take = mapped.find((item) => item.oldId === message.take.id)?.copy ?? mapped[0]?.copy ?? cloneTakeRecord(message.take);
  return {
    ...message,
    id: newId('msg'),
    take,
    takes: mapped.map((item) => item.copy),
    attachments: message.attachments?.map((image) => ({...image, id: newId('image')})),
  };
};

export const cloneTakeInMessage = (message: PrototypeMessage, takeId: string): PrototypeMessage => {
  const history = message.takes?.length ? message.takes : [message.take];
  const source = history.find((take) => take.id === takeId) ?? message.take;
  const copy = cloneTakeRecord(source);
  return {...message, takes: [...history, copy]};
};

export const reorderMessages = (
  messages: PrototypeMessage[],
  sourceId: string,
  targetId: string,
): PrototypeMessage[] => {
  const sourceIndex = messages.findIndex((message) => message.id === sourceId);
  const targetIndex = messages.findIndex((message) => message.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return messages;

  const reordered = [...messages];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  return reordered;
};

export const moveMessageBy = (
  messages: PrototypeMessage[],
  messageId: string,
  offset: -1 | 1,
): PrototypeMessage[] => {
  const sourceIndex = messages.findIndex((message) => message.id === messageId);
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= messages.length) return messages;

  const reordered = [...messages];
  [reordered[sourceIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[sourceIndex]];
  return reordered;
};
