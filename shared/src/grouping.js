import { displayWord, normalizeWord } from "./normalization.js";

export function groupDictionaryRecords(records) {
  const groups = new Map();

  for (const record of records) {
    const normalizedWord = normalizeWord(record?.word);
    if (!normalizedWord) throw new Error("Dictionary record has an empty word");
    const group = groups.get(normalizedWord) ?? {
      normalizedWord,
      word: displayWord(record.word),
      records: [],
    };
    group.records.push(record);
    groups.set(normalizedWord, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.normalizedWord < right.normalizedWord
      ? -1
      : left.normalizedWord > right.normalizedWord
        ? 1
        : 0,
  );
}
