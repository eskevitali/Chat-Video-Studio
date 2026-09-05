import type {WordTiming} from './types';

const AUDIO_TAG = /\[[^[\]]{1,80}\]/gu;
const SSML_BREAK = /<\/?break\b[^>]*\/?>/gi;

export const stripSpeechMarkup = (text: string): string =>
  text
    .replace(AUDIO_TAG, ' ')
    .replace(SSML_BREAK, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const isSpeechMarkupToken = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return stripSpeechMarkup(trimmed).length === 0;
};

export const displayWords = (words: WordTiming[]): WordTiming[] =>
  words
    .map((word) => ({...word, text: stripSpeechMarkup(word.text)}))
    .filter((word) => word.text.length > 0);
