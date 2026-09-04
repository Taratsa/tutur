import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { LETTER_ORDER, WORDS_PER_PAGE, letterPath, pageCount } from "./alphabet.js";

let database;

function databaseFile() {
  const configured = process.env.UI_DATABASE_PATH || process.env.SEARCH_DB_PATH;
  if (configured) return resolve(process.cwd(), configured);
  const candidates = ["../api/data/search.sqlite", "api/data/search.sqlite", "data/search.sqlite"];
  return (
    candidates.map((path) => resolve(process.cwd(), path)).find(existsSync) ||
    resolve(process.cwd(), candidates[0])
  );
}

function db() {
  database ??= new Database(databaseFile(), { readonly: true, create: false });
  return database;
}

function numberMetadata() {
  return Object.fromEntries(
    db()
      .query("SELECT key, value FROM metadata")
      .all()
      .map((row) => [row.key, Number(row.value) || 0]),
  );
}

export function getSiteStats() {
  const metadata = numberMetadata();
  const letters = Object.fromEntries(
    db()
      .query("SELECT letter, COUNT(*) AS count FROM entries GROUP BY letter")
      .all()
      .map((row) => [row.letter, row.count]),
  );
  return {
    dictionaryRecords: metadata.dictionaryRecords,
    uniqueHeadwords: metadata.uniqueHeadwords,
    duplicateRecords: metadata.dictionaryRecords - metadata.uniqueHeadwords,
    bakuRecords: metadata.bakuRecords,
    sinonimRecords: metadata.sinonimRecords,
    antonimRecords: metadata.antonimRecords,
    slugCollisionCount: metadata.slugCollisionCount,
    letters,
  };
}

export function getAvailableLetters() {
  const letters = getSiteStats().letters;
  return LETTER_ORDER.filter((letter) => letters[letter]);
}

export function getWordPaths() {
  return db()
    .query("SELECT slug FROM entries ORDER BY normalized_word")
    .all()
    .map((row) => `/kata/${row.slug}/`);
}

export function getAlphabetPaths() {
  const stats = getSiteStats();
  return Object.entries(stats.letters).flatMap(([letter, count]) =>
    Array.from({ length: Math.ceil(count / WORDS_PER_PAGE) }, (_, index) =>
      letterPath(letter, index + 1),
    ),
  );
}

function entrySummary(row) {
  return {
    word: row.word,
    normalizedWord: row.normalized_word,
    slug: row.slug,
    summary: row.summary,
  };
}

export function getLetterPage(letter, page) {
  const normalizedLetter = letter.toLocaleLowerCase("id-ID");
  if (!LETTER_ORDER.includes(normalizedLetter)) return null;
  const total =
    db().query("SELECT COUNT(*) AS count FROM entries WHERE letter = ?").get(normalizedLetter)
      ?.count ?? 0;
  const totalPages = pageCount(Array.from({ length: total }));
  if (page < 1 || page > totalPages)
    return { letter: normalizedLetter, page, total, totalPages, entries: [] };
  const entries = db()
    .query(
      "SELECT word, normalized_word, slug, summary FROM entries WHERE letter = ? ORDER BY normalized_word LIMIT ? OFFSET ?",
    )
    .all(normalizedLetter, WORDS_PER_PAGE, (page - 1) * WORDS_PER_PAGE)
    .map(entrySummary);
  return { letter: normalizedLetter, page, total, totalPages, entries };
}

function relatedWords(entry) {
  const relations = [
    ["baku_relations", "wrong", "wrong_slug", "Baku & nonbaku"],
    ["synonym_relations", "counterpart", "counterpart_slug", "Sinonim"],
    ["antonym_relations", "counterpart", "counterpart_slug", "Antonim"],
  ];
  const related = new Map();
  for (const [table, otherWord, otherSlug, kind] of relations) {
    for (const row of db()
      .query(
        `SELECT word, ${otherWord}, word_slug, ${otherSlug} FROM ${table} WHERE word_slug = ? OR ${otherSlug} = ?`,
      )
      .all(entry.slug, entry.slug)) {
      const left = row.word_slug === entry.slug;
      const word = left ? row[otherWord] : row.word;
      const slug = left ? row[otherSlug] : row.word_slug;
      if (slug && slug !== entry.slug) related.set(`${slug}:${kind}`, { word, slug, kind });
    }
  }
  return [...related.values()].sort(
    (left, right) =>
      left.word.localeCompare(right.word, "id") || left.kind.localeCompare(right.kind, "id"),
  );
}

export function getWordPage(slug) {
  const entry = db()
    .query("SELECT id, word, normalized_word, slug, letter, summary FROM entries WHERE slug = ?")
    .get(slug);
  if (!entry) return null;
  const definitions = db()
    .query(
      "SELECT ordinal, definition_html, definition_text, entry_type FROM definitions WHERE entry_id = ? ORDER BY ordinal",
    )
    .all(entry.id)
    .map((definition) => ({
      ordinal: definition.ordinal,
      html: definition.definition_html,
      text: definition.definition_text,
      type: definition.entry_type,
    }));
  const previous = db()
    .query(
      "SELECT word, slug FROM entries WHERE normalized_word < ? ORDER BY normalized_word DESC LIMIT 1",
    )
    .get(entry.normalized_word);
  const next = db()
    .query(
      "SELECT word, slug FROM entries WHERE normalized_word > ? ORDER BY normalized_word LIMIT 1",
    )
    .get(entry.normalized_word);
  return {
    ...entry,
    normalizedWord: entry.normalized_word,
    definitions,
    related: relatedWords(entry),
    previous,
    next,
  };
}

export function getDatabasePath() {
  return databaseFile();
}
