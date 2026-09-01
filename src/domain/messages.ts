import type {PrototypeMessage} from './types';

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
