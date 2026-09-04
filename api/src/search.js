import { characterCount, normalizeWord, tokenText } from "@tutur/shared/normalization";

export const SEARCH_TYPES = ["all", "dictionary", "baku", "sinonim", "antonim"];
export const MAX_LIMIT = 50;
const COLLECTION_ORDER = { dictionary: 0, baku: 1, sinonim: 2, antonim: 3 };

export function validateSearchParams({ q, type = "all", limit = "20" }) {
  const normalized = normalizeWord(q);
  if (characterCount(normalized) < 2)
    throw new SearchInputError("q must contain at least two characters");
  if (characterCount(normalized) > 80) throw new SearchInputError("q is too long");
  if (!SEARCH_TYPES.includes(type)) throw new SearchInputError("type is invalid");
  if (!/^\d+$/u.test(String(limit))) throw new SearchInputError("limit is invalid");
  const parsedLimit = Number(limit);
  if (parsedLimit < 1 || parsedLimit > MAX_LIMIT)
    throw new SearchInputError(`limit must be between 1 and ${MAX_LIMIT}`);
  return { query: normalized, type, limit: parsedLimit };
}

export class SearchInputError extends Error {}

function scopeFor(type) {
  return type === "all"
    ? "collection IN ('dictionary', 'baku', 'sinonim', 'antonim')"
    : "collection = ?";
}

function scopeParams(type) {
  return type === "all" ? [] : [type];
}

function escapeLike(value) {
  return value.replace(/[\\%_]/gu, "\\$&");
}

function escapeGlob(value) {
  return value.replace(/[\\*?\[\]]/gu, "\\$&");
}

function addResult(results, row, rank) {
  const current = results.get(row.id);
  const next = { ...row, rank };
  if (!current || rank < current.rank) results.set(row.id, next);
}

function compactResult(row) {
  return {
    type: row.collection,
    word: row.word,
    ...(row.secondary_word ? { counterpart: row.secondary_word } : {}),
    ...(row.slug ? { slug: row.slug } : {}),
    ...(row.url ? { url: row.url } : {}),
    summary: row.summary,
  };
}

export function createSearcher(db) {
  return function search(params) {
    const { query, type, limit } = validateSearchParams(params);
    const scope = scopeFor(type);
    const scopeArgs = scopeParams(type);
    const results = new Map();
    const exact = db
      .query(
        `SELECT id, collection, word, secondary_word, summary, slug, url FROM search_entries WHERE ${scope} AND (normalized_word = ? OR normalized_secondary = ?) ORDER BY CASE WHEN normalized_word = ? THEN 0 ELSE 1 END, id LIMIT ?`,
      )
      .all(...scopeArgs, query, query, query, limit);
    for (const row of exact) addResult(results, row, 0);

    const prefix = db
      .query(
        `SELECT id, collection, word, secondary_word, summary, slug, url FROM search_entries WHERE ${scope} AND (normalized_word GLOB ? OR normalized_secondary GLOB ?) ORDER BY id LIMIT ?`,
      )
      .all(...scopeArgs, `${escapeGlob(query)}*`, `${escapeGlob(query)}*`, limit * 3);
    for (const row of prefix) addResult(results, row, 1);

    const tokenQuery = tokenText(query)
      .split(" ")
      .filter(Boolean)
      .map((part) => `"${part.replaceAll('"', '""')}"`)
      .join(" AND ");
    if (tokenQuery) {
      const wholeToken = db
        .query(
          `SELECT se.id, se.collection, se.word, se.secondary_word, se.summary, se.slug, se.url FROM search_tokens AS f JOIN search_entries AS se ON se.id = f.search_id WHERE ${scope.replaceAll("collection", "se.collection")} AND f.search_tokens MATCH ? ORDER BY f.rank, se.id LIMIT ?`,
        )
        .all(...scopeArgs, tokenQuery, limit * 3);
      for (const row of wholeToken) addResult(results, row, 2);
    }

    const tokenizer = db
      .query("SELECT value FROM metadata WHERE key = 'ftsTokenizer'")
      .get()?.value;
    if (characterCount(query) >= 3) {
      try {
        const ftsQuery =
          tokenizer === "trigram"
            ? `"${query.replaceAll('"', '""')}"`
            : query
                .split(" ")
                .map((part) => `"${part.replaceAll('"', '""')}"*`)
                .join(" ");
        const fts = db
          .query(
            `SELECT se.id, se.collection, se.word, se.secondary_word, se.summary, se.slug, se.url FROM search_fts AS f JOIN search_entries AS se ON se.id = f.search_id WHERE ${scope.replaceAll("collection", "se.collection")} AND f.search_fts MATCH ? ORDER BY f.rank, se.id LIMIT ?`,
          )
          .all(...scopeArgs, ftsQuery, limit * 3);
        for (const row of fts) addResult(results, row, 3);
      } catch {
        // An invalid FTS token falls back to the indexed word paths above.
      }
    } else {
      const shortQuery = db
        .query(
          `SELECT id, collection, word, secondary_word, summary, slug, url FROM search_entries WHERE ${scope} AND search_text LIKE ? ESCAPE '\\' ORDER BY id LIMIT ?`,
        )
        .all(...scopeArgs, `%${escapeLike(query)}%`, limit * 2);
      for (const row of shortQuery) addResult(results, row, 3);
    }

    return [...results.values()]
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          COLLECTION_ORDER[left.collection] - COLLECTION_ORDER[right.collection] ||
          left.id - right.id,
      )
      .slice(0, limit)
      .map(compactResult);
  };
}
