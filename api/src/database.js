import { Database } from "bun:sqlite";
import { tokenText, normalizeWord } from "@tutur/shared/normalization";
import { truncateText } from "@tutur/shared/sanitize";

const COLLECTION_ORDER = ["dictionary", "baku", "sinonim", "antonim", "slang"];

function createSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      letter TEXT NOT NULL,
      summary TEXT NOT NULL,
      frequency INTEGER,
      root TEXT,
      root_rank INTEGER
    );
    CREATE TABLE definitions (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES entries(id),
      ordinal INTEGER NOT NULL,
      definition_html TEXT NOT NULL,
      definition_text TEXT NOT NULL,
      entry_type INTEGER
    );
    CREATE TABLE baku_relations (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      wrong TEXT NOT NULL,
      normalized_wrong TEXT NOT NULL,
      explanation TEXT NOT NULL,
      clue TEXT,
      word_slug TEXT,
      wrong_slug TEXT
    );
    CREATE TABLE synonym_relations (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      counterpart TEXT NOT NULL,
      normalized_counterpart TEXT NOT NULL,
      relation_type TEXT,
      explanation TEXT NOT NULL,
      usage_a TEXT NOT NULL,
      usage_b TEXT NOT NULL,
      word_slug TEXT,
      counterpart_slug TEXT
    );
    CREATE TABLE antonym_relations (
      id INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      counterpart TEXT NOT NULL,
      normalized_counterpart TEXT NOT NULL,
      opposition_type TEXT,
      field TEXT,
      confidence TEXT,
      explanation TEXT NOT NULL,
      usage_a TEXT NOT NULL,
      usage_b TEXT NOT NULL,
      note TEXT,
      word_slug TEXT,
      counterpart_slug TEXT
    );
    CREATE TABLE slang_relations (
      id INTEGER PRIMARY KEY,
      slang TEXT NOT NULL,
      normalized_slang TEXT NOT NULL,
      formal TEXT NOT NULL,
      normalized_formal TEXT NOT NULL,
      in_dictionary INTEGER NOT NULL,
      categories TEXT NOT NULL,
      formal_slug TEXT
    );
    CREATE TABLE word_families (
      id INTEGER PRIMARY KEY,
      normalized_root TEXT NOT NULL,
      root_slug TEXT NOT NULL,
      member TEXT NOT NULL,
      normalized_member TEXT NOT NULL,
      frequency INTEGER NOT NULL,
      member_slug TEXT,
      is_headword INTEGER NOT NULL
    );
    CREATE TABLE entry_extras (
      entry_id INTEGER PRIMARY KEY REFERENCES entries(id),
      pronunciation TEXT,
      etymology TEXT,
      examples TEXT NOT NULL,
      derivations TEXT NOT NULL,
      compounds TEXT NOT NULL,
      proverbs TEXT NOT NULL,
      idioms TEXT NOT NULL
    );
    CREATE TABLE search_entries (
      id INTEGER PRIMARY KEY,
      collection TEXT NOT NULL CHECK(collection IN ('dictionary', 'baku', 'sinonim', 'antonim', 'slang')),
      source_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      secondary_word TEXT,
      normalized_secondary TEXT,
      token_text TEXT NOT NULL,
      search_text TEXT NOT NULL,
      summary TEXT NOT NULL,
      slug TEXT,
      url TEXT,
      frequency INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  let tokenizer = "trigram";
  try {
    db.exec(
      "CREATE VIRTUAL TABLE search_fts USING fts5(search_id UNINDEXED, search_text, tokenize='trigram')",
    );
  } catch {
    tokenizer = "unicode61";
    db.exec(
      "CREATE VIRTUAL TABLE search_fts USING fts5(search_id UNINDEXED, search_text, tokenize='unicode61 remove_diacritics 1')",
    );
  }
  db.exec(
    "CREATE VIRTUAL TABLE search_tokens USING fts5(search_id UNINDEXED, token_text, tokenize='unicode61 remove_diacritics 1')",
  );
  return tokenizer;
}

function addSearchEntry(
  insert,
  insertTokens,
  nextId,
  collection,
  sourceId,
  word,
  secondary,
  summary,
  slug,
  frequency = 0,
) {
  const normalizedWord = word.normalized;
  const normalizedSecondary = secondary?.normalized ?? null;
  const compactSummary = truncateText(summary || word.display, 240);
  const compactText = `${normalizedWord} ${normalizedSecondary ?? ""} ${compactSummary}`.trim();
  insert.run(
    nextId,
    collection,
    sourceId,
    word.display,
    normalizedWord,
    secondary?.display ?? null,
    normalizedSecondary,
    tokenText(compactText),
    compactText,
    compactSummary,
    slug ?? null,
    slug ? `/kata/${slug}/` : null,
    frequency,
  );
  insertTokens.run(nextId, nextId, compactText);
  return nextId + 1;
}

export function buildDatabase(data, outputPath) {
  const db = new Database(outputPath);
  db.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;");
  const tokenizer = createSchema(db);
  const entryByWord = new Map(data.entries.map((entry) => [entry.normalizedWord, entry]));
  const slugFor = (normalized) => entryByWord.get(normalized)?.slug ?? null;

  const insertEntry = db.prepare("INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertDefinition = db.prepare("INSERT INTO definitions VALUES (?, ?, ?, ?, ?, ?)");
  const insertBaku = db.prepare("INSERT INTO baku_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertSinonim = db.prepare(
    "INSERT INTO synonym_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertAntonim = db.prepare(
    "INSERT INTO antonym_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertSlang = db.prepare("INSERT INTO slang_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertFamily = db.prepare("INSERT INTO word_families VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertExtras = db.prepare("INSERT INTO entry_extras VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertSearch = db.prepare(
    "INSERT INTO search_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertFts = db.prepare(
    "INSERT INTO search_fts(rowid, search_id, search_text) VALUES (?, ?, ?)",
  );
  const insertTokens = db.prepare(
    "INSERT INTO search_tokens(rowid, search_id, token_text) VALUES (?, ?, ?)",
  );

  let definitionId = 1;
  let searchId = 1;
  let familyId = 1;
  const insertAll = db.transaction(() => {
    for (const entry of data.entries) {
      insertEntry.run(
        entry.id,
        entry.word,
        entry.normalizedWord,
        entry.slug,
        entry.letter,
        entry.definitions[0].text.slice(0, 240),
        entry.frequency ?? null,
        entry.root ?? null,
        entry.rootRank ?? null,
      );
      for (let index = 0; index < entry.definitions.length; index += 1) {
        const definition = entry.definitions[index];
        insertDefinition.run(
          definitionId,
          entry.id,
          index + 1,
          definition.html,
          definition.text,
          definition.type,
        );
        definitionId += 1;
      }
      if (entry.extras) {
        insertExtras.run(
          entry.id,
          entry.extras.pronunciation ?? null,
          entry.extras.etymology ?? null,
          JSON.stringify(entry.extras.examples ?? []),
          JSON.stringify(entry.extras.derivations ?? []),
          JSON.stringify(entry.extras.compounds ?? []),
          JSON.stringify(entry.extras.proverbs ?? []),
          JSON.stringify(entry.extras.idioms ?? []),
        );
      }
      searchId = addSearchEntry(
        insertSearch,
        insertTokens,
        searchId,
        "dictionary",
        entry.id,
        { display: entry.word, normalized: entry.normalizedWord },
        null,
        entry.definitions[0].text.slice(0, 240),
        entry.slug,
        entry.frequency ?? 0,
      );
      insertFts.run(
        searchId - 1,
        searchId - 1,
        `${entry.normalizedWord} ${entry.definitions.map((definition) => definition.text).join(" ")}`,
      );
    }

    for (const relation of data.relations.baku) {
      const wordSlug = slugFor(relation.normalizedWord);
      const wrongSlug = slugFor(relation.normalizedWrong);
      insertBaku.run(
        relation.id,
        relation.word,
        relation.normalizedWord,
        relation.wrong,
        relation.normalizedWrong,
        relation.explanation,
        relation.clue,
        wordSlug,
        wrongSlug,
      );
      searchId = addSearchEntry(
        insertSearch,
        insertTokens,
        searchId,
        "baku",
        relation.id,
        { display: relation.word, normalized: relation.normalizedWord },
        { display: relation.wrong, normalized: relation.normalizedWrong },
        relation.explanation,
        wordSlug ?? wrongSlug,
      );
      insertFts.run(
        searchId - 1,
        searchId - 1,
        `${relation.normalizedWord} ${relation.normalizedWrong} ${relation.explanation} ${relation.clue ?? ""}`,
      );
    }

    for (const relation of data.relations.sinonim) {
      const wordSlug = slugFor(relation.normalizedWord);
      const counterpartSlug = slugFor(relation.normalizedWrong);
      insertSinonim.run(
        relation.id,
        relation.word,
        relation.normalizedWord,
        relation.wrong,
        relation.normalizedWrong,
        relation.type,
        relation.explanation,
        relation.usageA,
        relation.usageB,
        wordSlug,
        counterpartSlug,
      );
      searchId = addSearchEntry(
        insertSearch,
        insertTokens,
        searchId,
        "sinonim",
        relation.id,
        { display: relation.word, normalized: relation.normalizedWord },
        { display: relation.wrong, normalized: relation.normalizedWrong },
        relation.explanation,
        wordSlug ?? counterpartSlug,
      );
      insertFts.run(
        searchId - 1,
        searchId - 1,
        `${relation.normalizedWord} ${relation.normalizedWrong} ${relation.explanation} ${relation.usageA} ${relation.usageB}`,
      );
    }

    for (const relation of data.relations.antonim) {
      const wordSlug = slugFor(relation.normalizedWord);
      const counterpartSlug = slugFor(relation.normalizedWrong);
      insertAntonim.run(
        relation.id,
        relation.word,
        relation.normalizedWord,
        relation.wrong,
        relation.normalizedWrong,
        relation.oppositionType,
        relation.field,
        relation.confidence,
        relation.explanation,
        relation.usageA,
        relation.usageB,
        relation.note,
        wordSlug,
        counterpartSlug,
      );
      searchId = addSearchEntry(
        insertSearch,
        insertTokens,
        searchId,
        "antonim",
        relation.id,
        { display: relation.word, normalized: relation.normalizedWord },
        { display: relation.wrong, normalized: relation.normalizedWrong },
        relation.explanation,
        wordSlug ?? counterpartSlug,
      );
      insertFts.run(
        searchId - 1,
        searchId - 1,
        `${relation.normalizedWord} ${relation.normalizedWrong} ${relation.explanation} ${relation.usageA} ${relation.usageB} ${relation.note ?? ""}`,
      );
    }

    for (const relation of data.relations.slang ?? []) {
      const formalSlug = slugFor(relation.normalizedFormal);
      insertSlang.run(
        relation.id,
        relation.slang,
        relation.normalizedSlang,
        relation.formal,
        relation.normalizedFormal,
        relation.inDictionary ? 1 : 0,
        JSON.stringify(relation.categories ?? []),
        formalSlug,
      );
      searchId = addSearchEntry(
        insertSearch,
        insertTokens,
        searchId,
        "slang",
        relation.id,
        { display: relation.slang, normalized: relation.normalizedSlang },
        { display: relation.formal, normalized: relation.normalizedFormal },
        `Bentuk slang (tidak baku) dari "${relation.formal}".`,
        formalSlug,
      );
      insertFts.run(
        searchId - 1,
        searchId - 1,
        `${relation.normalizedSlang} ${relation.normalizedFormal} bentuk slang tidak baku`,
      );
    }
    for (const family of data.families ?? []) {
      for (const member of family.members) {
        insertFamily.run(
          familyId,
          family.root,
          family.rootSlug,
          member.text,
          normalizeWord(member.text),
          member.frequency ?? 0,
          member.slug ?? null,
          member.slug ? 1 : 0,
        );
        familyId += 1;
      }
    }
  });
  insertAll();

  db.exec(`
    CREATE INDEX idx_entries_letter_word ON entries(letter, normalized_word);
    CREATE INDEX idx_entries_normalized_word ON entries(normalized_word);
    CREATE INDEX idx_entries_frequency ON entries(frequency);
    CREATE INDEX idx_search_collection_word ON search_entries(collection, normalized_word);
    CREATE INDEX idx_search_collection_secondary ON search_entries(collection, normalized_secondary);
    CREATE INDEX idx_search_normalized_word ON search_entries(normalized_word);
    CREATE INDEX idx_search_normalized_secondary ON search_entries(normalized_secondary);
    CREATE INDEX idx_search_collection_token ON search_entries(collection, token_text);
    CREATE INDEX idx_definitions_entry_ordinal ON definitions(entry_id, ordinal);
    CREATE INDEX idx_slang_normalized_slang ON slang_relations(normalized_slang);
    CREATE INDEX idx_slang_formal_slug ON slang_relations(formal_slug);
    CREATE INDEX idx_families_root ON word_families(normalized_root, frequency DESC);
  `);
  const metadata = db.prepare("INSERT INTO metadata VALUES (?, ?)");
  metadata.run("ftsTokenizer", tokenizer);
  metadata.run("dictionaryRecords", String(data.stats.dictionaryRecords));
  metadata.run("uniqueHeadwords", String(data.stats.uniqueHeadwords));
  metadata.run("bakuRecords", String(data.stats.bakuRecords));
  metadata.run("sinonimRecords", String(data.stats.sinonimRecords));
  metadata.run("antonimRecords", String(data.stats.antonimRecords));
  metadata.run("slangRecords", String(data.stats.slangRecords ?? 0));
  metadata.run("slugCollisionCount", String(data.stats.slugCollisionCount));
  metadata.run("enrichedWords", String(data.stats.enrichedWords ?? 0));
  metadata.run("extrasEntries", String(data.stats.extrasEntries ?? 0));
  metadata.run("familyRoots", String(data.stats.familyRoots ?? 0));
  metadata.run("familyMembers", String(data.stats.familyMembers ?? 0));
  metadata.run("searchRecords", String(searchId - 1));
  db.exec("PRAGMA optimize;");
  db.close();
  return { tokenizer, searchRecords: searchId - 1 };
}

export function openReadOnlyDatabase(path) {
  return new Database(path, { readonly: true, create: false });
}

export { COLLECTION_ORDER };
