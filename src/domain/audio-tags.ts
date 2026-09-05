export type AudioTagHint = {
  tag: string;
  hint: string;
};

export const AUDIO_TAG_HINTS: AudioTagHint[] = [
  {tag: 'calm', hint: 'спокойно'},
  {tag: 'softly', hint: 'мягко, негромко'},
  {tag: 'quietly', hint: 'тихо, сдержанно'},
  {tag: 'reflective', hint: 'задумчиво, рефлексивно'},
  {tag: 'thoughtful', hint: 'вдумчиво'},
  {tag: 'warm', hint: 'тепло, душевно'},
  {tag: 'gentle', hint: 'нежно, деликатно'},
  {tag: 'serious', hint: 'серьёзно'},
  {tag: 'serious tone', hint: 'серьёзно'},
  {tag: 'sad', hint: 'печально'},
  {tag: 'melancholic', hint: 'меланхолично'},
  {tag: 'wistful', hint: 'с тихой тоской, ностальгией'},
  {tag: 'hopeful', hint: 'с надеждой'},
  {tag: 'tense', hint: 'напряжённо'},
  {tag: 'with restrained tension', hint: 'со сдержанным напряжением'},
  {tag: 'dramatic', hint: 'драматично'},
  {tag: 'more emotional', hint: 'эмоциональнее, чем предыдущий фрагмент'},
  {tag: 'slower', hint: 'медленнее'},
  {tag: 'faster', hint: 'быстрее'},
  {tag: 'whispers', hint: 'шёпотом'},
  {tag: 'pause', hint: 'заметная пауза'},
  {tag: 'short pause', hint: 'короткая пауза'},
  {tag: 'long pause', hint: 'длинная смысловая пауза'},
  {tag: 'continues softly', hint: 'продолжить мягко после предыдущего фрагмента'},
  {tag: 'slightly more focused', hint: 'чуть собраннее, с большим акцентом на смысле'},
  {tag: 'with a hint of foreboding', hint: 'с лёгким предчувствием чего-то тревожного'},
  {tag: 'as if remembering something distant', hint: 'будто вспоминает что-то далёкое'},
  {tag: 'with growing unease', hint: 'с нарастающим беспокойством'},
  {tag: 'almost whispering', hint: 'почти шёпотом'},
  {tag: 'with quiet resignation', hint: 'с тихим смирением'},
];

export type IncompleteTag = {
  start: number;
  query: string;
};

export const incompleteTagAt = (text: string, caret: number): IncompleteTag | null => {
  if (caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('[');
  if (start < 0) return null;
  const chunk = before.slice(start + 1);
  if (chunk.includes(']') || chunk.includes('\n')) return null;
  if (chunk.length > 80) return null;
  return {start, query: chunk};
};

export const filterAudioTags = (query: string, catalog: AudioTagHint[] = AUDIO_TAG_HINTS): AudioTagHint[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return catalog;
  return catalog.filter((item) =>
    item.tag.toLowerCase().includes(needle) || item.hint.toLowerCase().includes(needle));
};

export const applyAudioTag = (text: string, caret: number, tag: string): {text: string; caret: number} | null => {
  const incomplete = incompleteTagAt(text, caret);
  if (!incomplete) return null;
  const insertion = `[${tag}] `;
  const next = `${text.slice(0, incomplete.start)}${insertion}${text.slice(caret)}`;
  return {text: next, caret: incomplete.start + insertion.length};
};
