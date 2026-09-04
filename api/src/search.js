import { characterCount, normalizeWord, tokenText } from "@tutur/shared/normalization";

export const SEARCH_TYPES = ["all", "dictionary", "baku", "sinonim", "antonim", "slang"];
export const MAX_LIMIT = 50;
const COLLECTION_ORDER = { dictionary: 0, baku: 1, sinonim: 2, antonim: 3, slang: 4 };
// Trigram MATCH pada query pendek memindai kumpulan match yang sangat besar
// (uji beban: 8 RPS dengan p99 20 detik pada query 3 karakter) sehingga query
// 2-3 karakter diarahkan ke pemindaian LIKE yang berbatas.
const MIN_TRIGRAM_LENGTH = 4;

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
    ? "collection IN ('dictionary', 'baku', 'sinonim', 'antonim', 'slang')"
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
  // Nilai tokenizer tidak pernah berubah selama database read-only terbuka,
  // jadi cukup dibaca sekali per proses, bukan sekali per permintaan.
  let tokenizerLookupDone = false;
  let tokenizer;
  const getTokenizer = () => {
    if (!tokenizerLookupDone) {
      tokenizer = db.query("SELECT value FROM metadata WHERE key = 'ftsTokenizer'").get()?.value;
      tokenizerLookupDone = true;
    }
    return tokenizer;
  };

  function finish(results, limit) {
    return [...results.values()]
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          COLLECTION_ORDER[left.collection] - COLLECTION_ORDER[right.collection] ||
          right.frequency - left.frequency ||
          left.id - right.id,
      )
      .slice(0, limit)
      .map(compactResult);
  }

  // Fase dijalankan berurutan sesuai rank (exact=0 … fts/like=3). Urutan akhir
  // memprioritaskan rank, jadi begitu jumlah hasil mencapai limit, fase
  // berikutnya tidak mungkin masuk hasil akhir dan bisa langsung dilewati.
  function searchPrepared({ query, type, limit }) {
    const scope = scopeFor(type);
    const scopeArgs = scopeParams(type);
    const results = new Map();

    const exact = db
      .query(
        `SELECT id, collection, word, secondary_word, summary, slug, url, frequency FROM search_entries WHERE ${scope} AND (normalized_word = ? OR normalized_secondary = ?) ORDER BY CASE WHEN normalized_word = ? THEN 0 ELSE 1 END, id LIMIT ?`,
      )
      .all(...scopeArgs, query, query, query, limit);
    for (const row of exact) addResult(results, row, 0);
    if (results.size >= limit) return finish(results, limit);

    const prefix = db
      .query(
        `SELECT id, collection, word, secondary_word, summary, slug, url, frequency FROM search_entries WHERE ${scope} AND (normalized_word GLOB ? OR normalized_secondary GLOB ?) ORDER BY id LIMIT ?`,
      )
      .all(...scopeArgs, `${escapeGlob(query)}*`, `${escapeGlob(query)}*`, limit * 3);
    for (const row of prefix) addResult(results, row, 1);
    if (results.size >= limit) return finish(results, limit);

    const tokenQuery = tokenText(query)
      .split(" ")
      .filter(Boolean)
      .map((part) => `"${part.replaceAll('"', '""')}"`)
      .join(" AND ");
    if (tokenQuery) {
      const wholeToken = db
        .query(
          `SELECT se.id, se.collection, se.word, se.secondary_word, se.summary, se.slug, se.url, se.frequency FROM search_tokens AS f JOIN search_entries AS se ON se.id = f.search_id WHERE ${scope.replaceAll("collection", "se.collection")} AND f.search_tokens MATCH ? ORDER BY f.rank, se.id LIMIT ?`,
        )
        .all(...scopeArgs, tokenQuery, limit * 3);
      for (const row of wholeToken) addResult(results, row, 2);
      if (results.size >= limit) return finish(results, limit);
    }

    if (characterCount(query) >= MIN_TRIGRAM_LENGTH) {
      try {
        const ftsQuery =
          getTokenizer() === "trigram"
            ? `"${query.replaceAll('"', '""')}"`
            : query
                .split(" ")
                .map((part) => `"${part.replaceAll('"', '""')}"*`)
                .join(" ");
        const fts = db
          .query(
            `SELECT se.id, se.collection, se.word, se.secondary_word, se.summary, se.slug, se.url, se.frequency FROM search_fts AS f JOIN search_entries AS se ON se.id = f.search_id WHERE ${scope.replaceAll("collection", "se.collection")} AND f.search_fts MATCH ? ORDER BY f.rank, se.id LIMIT ?`,
          )
          .all(...scopeArgs, ftsQuery, limit * 3);
        for (const row of fts) addResult(results, row, 3);
      } catch {
        // An invalid FTS token falls back to the indexed word paths above.
      }
    } else {
      const shortQuery = db
        .query(
          `SELECT id, collection, word, secondary_word, summary, slug, url, frequency FROM search_entries WHERE ${scope} AND search_text LIKE ? ESCAPE '\\' ORDER BY id LIMIT ?`,
        )
        .all(...scopeArgs, `%${escapeLike(query)}%`, limit * 2);
      for (const row of shortQuery) addResult(results, row, 3);
    }

    return finish(results, limit);
  }

  function search(params) {
    return searchPrepared(validateSearchParams(params));
  }

  return { search, searchPrepared };
}
