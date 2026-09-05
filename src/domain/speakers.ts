import type {PrototypeMessage, PrototypeProject, Role, Speaker} from './types';

export const PRIMARY_USER_SPEAKER_ID = 'user';
export const ASSISTANT_SPEAKER_ID = 'assistant';
export const MAX_USER_SPEAKERS = 8;

export const defaultSpeakers = (messages: PrototypeMessage[] = []): Speaker[] => {
  const userName = messages.find((message) => message.role === 'user')?.author || 'Пользователь 1';
  const assistantName = messages.find((message) => message.role === 'assistant')?.author || 'Ассистент';
  return [
    {id: PRIMARY_USER_SPEAKER_ID, role: 'user', name: userName === 'Пользователь' ? 'Пользователь 1' : userName},
    {id: ASSISTANT_SPEAKER_ID, role: 'assistant', name: assistantName},
  ];
};

export const resolveSpeakers = (project: Pick<PrototypeProject, 'speakers' | 'messages'>): Speaker[] => {
  if (project.speakers?.length) return project.speakers;
  return defaultSpeakers(project.messages);
};

export const speakerIdOf = (message: Pick<PrototypeMessage, 'role' | 'speakerId'>): string =>
  message.speakerId || (message.role === 'assistant' ? ASSISTANT_SPEAKER_ID : PRIMARY_USER_SPEAKER_ID);

export const speakerOf = (message: Pick<PrototypeMessage, 'role' | 'speakerId'>, speakers: Speaker[]): Speaker =>
  speakers.find((speaker) => speaker.id === speakerIdOf(message))
  || speakers.find((speaker) => speaker.role === message.role)
  || defaultSpeakers()[0];

export const userSpeakers = (speakers: Speaker[]): Speaker[] =>
  speakers.filter((speaker) => speaker.role === 'user');

export const nextUserSpeaker = (speakers: Speaker[]): Speaker => {
  const users = userSpeakers(speakers);
  let index = users.length + 1;
  while (speakers.some((speaker) => speaker.id === `user-${index}`)) index += 1;
  return {id: `user-${index}`, role: 'user', name: `Пользователь ${index}`};
};

export const userSpeakerIndex = (speakerId: string, speakers: Speaker[]): number =>
  userSpeakers(speakers).findIndex((speaker) => speaker.id === speakerId);

export const isUserSide = (message: Pick<PrototypeMessage, 'role' | 'speakerId'>, speakers: Speaker[]): boolean =>
  speakerOf(message, speakers).role === 'user';
