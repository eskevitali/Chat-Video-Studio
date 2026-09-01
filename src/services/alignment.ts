import type {WordTiming} from '../domain/types';

export type CharacterAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export const characterAlignmentToWords = (alignment: CharacterAlignment): WordTiming[] => {
  const {characters, character_start_times_seconds: starts, character_end_times_seconds: ends} = alignment;
  if (characters.length !== starts.length || characters.length !== ends.length) {
    throw new Error('ElevenLabs вернул несогласованные массивы таймингов.');
  }

  const result: WordTiming[] = [];
  let text = '';
  let startMs = 0;
  let endMs = 0;

  const flush = () => {
    if (!text) return;
    result.push({text, startMs, endMs});
    text = '';
  };

  characters.forEach((character, index) => {
    if (/\s/u.test(character)) {
      flush();
      return;
    }
    if (!text) startMs = Math.round(starts[index] * 1000);
    text += character;
    endMs = Math.round(ends[index] * 1000);
  });
  flush();
  return result;
};
