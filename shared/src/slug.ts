import { normalizeWord } from "./normalization.ts";

export interface SlugMap {
  wordToSlug: Map<string, string>;
  slugToWord: Map<string, string>;
  collisionCount: number;
}

function readableSlug(value: string): string {
  const slug = normalizeWord(value)
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  if (!slug || slug.length > 180) {
    throw new Error(`Word cannot be represented safely as a slug: ${value}`);
  }

  return slug;
}

export function createSlugMap(words: string[]): SlugMap {
  const normalizedWords = [...new Set(words.map(normalizeWord))];
  if (normalizedWords.some((word) => !word)) {
    throw new Error("Cannot create slugs for an empty normalized word");
  }

  normalizedWords.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const wordToSlug = new Map<string, string>();
  const slugToWord = new Map<string, string>();
  const usedSlugs = new Set<string>();
  let collisionCount = 0;

  for (const word of normalizedWords) {
    const base = readableSlug(word);
    let slug = base;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    if (slug !== base) collisionCount += 1;
    usedSlugs.add(slug);
    wordToSlug.set(word, slug);
    slugToWord.set(slug, word);
  }

  return { wordToSlug, slugToWord, collisionCount };
}

export function slugForWord(word: string, slugMap: Map<string, string>): string {
  const normalized = normalizeWord(word);
  const slug = slugMap.get(normalized);
  if (!slug) throw new Error(`No slug exists for normalized word: ${normalized}`);
  return slug;
}
