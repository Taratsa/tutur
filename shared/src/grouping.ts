import { displayWord, normalizeWord } from "./normalization.ts";

export interface WordGroup<T> {
  normalizedWord: string;
  word: string;
  records: T[];
}

export function groupDictionaryRecords<T extends { word?: unknown }>(records: T[]): WordGroup<T>[] {
  const groups = new Map<string, WordGroup<T>>();

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
