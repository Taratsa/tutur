import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { alliterationKey, rhymeKey } from "@tutur/shared/rhyme";
import { LETTER_ORDER, WORDS_PER_PAGE, letterPath, pageCount } from "./alphabet.js";

export const RHYME_KINDS = ["akhir", "awal"];

let database;
let dailyWordCache;

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
    slangRecords: metadata.slangRecords,
    rhymeKeys: metadata.rhymeKeys,
    slugCollisionCount: metadata.slugCollisionCount,
    enrichedWords: metadata.enrichedWords,
    extrasEntries: metadata.extrasEntries,
    familyRoots: metadata.familyRoots,
    familyMembers: metadata.familyMembers,
    kaikkiHyphenationTerms: metadata.kaikkiHyphenationTerms,
    letters,
  };
}

export function getWordOfDay(dayNumber) {
  if (dailyWordCache?.dayNumber === dayNumber) return dailyWordCache.entry;
  const where = "frequency >= 100 AND length(word) BETWEEN 4 AND 18 AND instr(word, ' ') = 0";
  const count =
    db().query(`SELECT COUNT(*) AS count FROM entries WHERE ${where}`).get()?.count ?? 0;
  if (!count) return null;
  const offset = (dayNumber * 7919) % count;
  const entry = db()
    .query(
      `SELECT word, slug, summary FROM entries WHERE ${where} ORDER BY normalized_word LIMIT 1 OFFSET ?`,
    )
    .get(offset);
  dailyWordCache = { dayNumber, entry };
  return entry;
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

function parseList(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCategories(value) {
  return parseList(value).filter((item) => typeof item === "string" && item);
}

function parseKaikkiForms(value) {
  return parseList(value)
    .filter((item) => item && typeof item.text === "string" && item.text)
    .map((item) => ({
      text: item.text,
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag) => typeof tag === "string" && tag)
        : [],
    }));
}

export function getWordPage(slug) {
  const entry = db()
    .query(
      "SELECT id, word, normalized_word, slug, letter, summary, frequency, root, root_rank, syllabifications FROM entries WHERE slug = ?",
    )
    .get(slug);
  if (!entry) return null;
  const definitions = db()
    .query(
      "SELECT ordinal, definition_html, definition_text, entry_type, edition FROM definitions WHERE entry_id = ? ORDER BY ordinal",
    )
    .all(entry.id)
    .map((definition) => ({
      ordinal: definition.ordinal,
      html: definition.definition_html,
      text: definition.definition_text,
      type: definition.entry_type,
      edition: definition.edition ?? "IV",
    }));
  const ivDefinitions = definitions.filter((definition) => definition.edition !== "VI");
  const v6Definitions = definitions.filter((definition) => definition.edition === "VI");
  const etymologyRelations = db()
    .query(
      "SELECT relation_type, related_lang, related_term FROM etymology_relations WHERE normalized_term = ? AND substr(relation_type, 1, 6) != 'group_' ORDER BY id",
    )
    .all(entry.normalized_word)
    .map((relation) => ({
      relationType: relation.relation_type,
      relatedLang: relation.related_lang,
      relatedTerm: relation.related_term,
    }));
  const kaikkiEntries = db()
    .query(
      "SELECT part_of_speech, etymology, pronunciations, hyphenations, forms, derived, synonyms FROM kaikki_entries WHERE normalized_word = ? ORDER BY id",
    )
    .all(entry.normalized_word)
    .map((row) => ({
      partOfSpeech: row.part_of_speech,
      etymology: row.etymology,
      pronunciations: parseCategories(row.pronunciations),
      hyphenations: parseCategories(row.hyphenations),
      forms: parseKaikkiForms(row.forms),
      derived: parseCategories(row.derived),
      synonyms: parseCategories(row.synonyms),
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
  const rootEntry = entry.root
    ? db().query("SELECT word, slug FROM entries WHERE normalized_word = ?").get(entry.root)
    : null;
  const extras = db()
    .query(
      "SELECT pronunciation, etymology, examples, derivations, compounds, proverbs, idioms, variants FROM entry_extras WHERE entry_id = ?",
    )
    .get(entry.id);
  const slangForms = entry.slug
    ? db()
        .query(
          "SELECT slang, formal, categories FROM slang_relations WHERE formal_slug = ? ORDER BY LENGTH(slang), slang LIMIT 12",
        )
        .all(entry.slug)
        .map((row) => ({
          slang: row.slang,
          formal: row.formal,
          categories: parseCategories(row.categories),
        }))
    : [];
  const slangTargets = db()
    .query(
      "SELECT formal, formal_slug FROM slang_relations WHERE normalized_slang = ? AND formal_slug IS NOT NULL AND formal_slug != ? ORDER BY formal LIMIT 6",
    )
    .all(entry.normalized_word, entry.slug)
    .map((row) => ({ word: row.formal, slug: row.formal_slug }));
  const family = entry.root
    ? db()
        .query(
          "SELECT member, member_slug, frequency FROM word_families WHERE normalized_root = ? AND normalized_member != ? ORDER BY frequency DESC, member LIMIT 18",
        )
        .all(entry.root, entry.normalized_word)
        .map((row) => ({ word: row.member, slug: row.member_slug, frequency: row.frequency }))
    : [];
  return {
    ...entry,
    normalizedWord: entry.normalized_word,
    frequency: entry.frequency,
    root: entry.root,
    rootRank: entry.root_rank,
    syllabifications: parseCategories(entry.syllabifications),
    rootWord: rootEntry?.word ?? null,
    rootSlug: rootEntry?.slug ?? null,
    definitions: ivDefinitions,
    v6Definitions,
    etymologyRelations,
    kaikkiEntries,
    extras: extras
      ? {
          pronunciation: extras.pronunciation,
          etymology: extras.etymology,
          examples: parseList(extras.examples),
          derivations: parseList(extras.derivations),
          compounds: parseList(extras.compounds),
          proverbs: parseList(extras.proverbs),
          idioms: parseList(extras.idioms),
          variants: parseList(extras.variants),
        }
      : null,
    slangForms,
    slangTargets,
    family,
    related: relatedWords(entry),
    previous,
    next,
  };
}

export function getWordCard(slug) {
  const entry = db()
    .query(
      "SELECT id, word, normalized_word, summary, syllabifications FROM entries WHERE slug = ?",
    )
    .get(slug);
  if (!entry) return null;
  const kbbiPronunciation = db()
    .query("SELECT pronunciation FROM entry_extras WHERE entry_id = ?")
    .get(entry.id)?.pronunciation;
  const kaikki = db()
    .query("SELECT pronunciations, hyphenations FROM kaikki_entries WHERE normalized_word = ?")
    .all(entry.normalized_word);
  return {
    id: entry.id,
    word: entry.word,
    summary: entry.summary,
    syllabifications: [
      ...new Set([
        ...parseCategories(entry.syllabifications),
        ...kaikki.flatMap((item) => parseCategories(item.hyphenations)),
      ]),
    ],
    pronunciations: [
      ...new Set([
        ...(kbbiPronunciation
          ? [kbbiPronunciation.startsWith("/") ? kbbiPronunciation : `/${kbbiPronunciation}/`]
          : []),
        ...kaikki.flatMap((item) => parseCategories(item.pronunciations)),
      ]),
    ],
  };
}

export function getPopularWords(limit = 100) {
  return db()
    .query(
      "SELECT word, slug, frequency, root FROM entries WHERE frequency IS NOT NULL ORDER BY frequency DESC, normalized_word LIMIT ?",
    )
    .all(limit)
    .map((row) => ({ word: row.word, slug: row.slug, frequency: row.frequency, root: row.root }));
}

function isRhymeKind(kind) {
  return RHYME_KINDS.includes(kind);
}

export function getRhymeGroup(kind, key, page = 1) {
  if (!isRhymeKind(kind) || !/^[a-z0-9]{2,}$/u.test(key)) return null;
  const total =
    db().query("SELECT COUNT(*) AS count FROM rhyme_keys WHERE kind = ? AND key = ?").get(kind, key)
      ?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / WORDS_PER_PAGE));
  if (total === 0 || page < 1 || page > totalPages) return null;
  const entries = db()
    .query(
      "SELECT e.word, e.slug, e.summary FROM (SELECT entry_id FROM rhyme_keys WHERE kind = ? AND key = ? ORDER BY frequency DESC, entry_id LIMIT ? OFFSET ?) AS k JOIN entries AS e ON e.id = k.entry_id",
    )
    .all(kind, key, WORDS_PER_PAGE, (page - 1) * WORDS_PER_PAGE)
    .map((row) => ({ word: row.word, slug: row.slug, summary: row.summary }));
  return { kind, key, page, total, totalPages, entries };
}

// Database read-only: agregasi grup rima tidak pernah berubah selama proses
// hidup, jadi cukup dihitung sekali per jenis agar halaman /rima/ tetap cepat.
const popularRhymeGroupsCache = new Map();

export function getPopularRhymeGroups(kind, limit = 24) {
  if (!isRhymeKind(kind)) return [];
  const cacheKey = `${kind}:${limit}`;
  if (!popularRhymeGroupsCache.has(cacheKey)) {
    popularRhymeGroupsCache.set(
      cacheKey,
      db()
        .query(
          "SELECT k.key, COUNT(*) AS total FROM rhyme_keys AS k JOIN entries AS e ON e.id = k.entry_id WHERE k.kind = ? GROUP BY k.key HAVING COUNT(*) > 1 ORDER BY total DESC, k.key LIMIT ?",
        )
        .all(kind, limit)
        .map((row) => ({ key: row.key, total: row.total })),
    );
  }
  return popularRhymeGroupsCache.get(cacheKey);
}

export function getWordRhymes(normalizedWord, limit = 12) {
  const rhymeQuery =
    "SELECT e.word, e.slug FROM (SELECT entry_id FROM rhyme_keys WHERE kind = ? AND key = ? ORDER BY frequency DESC, entry_id LIMIT ?) AS k JOIN entries AS e ON e.id = k.entry_id WHERE e.normalized_word != ? LIMIT ?";
  const akhir = {
    key: rhymeKey(normalizedWord),
    words: db()
      .query(rhymeQuery)
      .all("akhir", rhymeKey(normalizedWord), limit + 2, normalizedWord, limit),
  };
  const awal = {
    key: alliterationKey(normalizedWord),
    words: db()
      .query(rhymeQuery)
      .all("awal", alliterationKey(normalizedWord), limit + 2, normalizedWord, limit),
  };
  return { akhir, awal };
}

export function getWordGraph(slug) {
  const row = db()
    .query(
      "SELECT data, (SELECT value FROM metadata WHERE key = 'graphCorpusSentences') AS corpus_sentences FROM word_graphs WHERE slug = ?",
    )
    .get(slug);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data);
    return Array.isArray(parsed.nodes) && parsed.nodes.length > 0
      ? { ...parsed, corpusSentences: Number(row.corpus_sentences) || 0 }
      : null;
  } catch {
    return null;
  }
}

export function getDatabasePath() {
  return databaseFile();
}
