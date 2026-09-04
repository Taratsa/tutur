import { mkdir, rm, writeFile } from "node:fs/promises";
import { createSlugMap } from "../shared/src/slug.js";
import { groupDictionaryRecords } from "../shared/src/grouping.js";
import { definitionToText, sanitizeDefinition, truncateText } from "../shared/src/sanitize.js";
import { displayWord, normalizeWord, tokenText, wordLetter } from "../shared/src/normalization.js";

const root = new URL("../", import.meta.url);
const sourcePaths = {
  dictionary: new URL("edisi-IV/dictionary__JSON.json", root),
  baku: new URL("baku-nonbaku/dictionary_baku_nonbaku__JSON.json", root),
  sinonim: new URL("sinonim/dictionary_sinonim__JSON.json", root),
  antonim: new URL("antonim/dictionary_antonim__JSON.json", root),
};
const outputDirectory = new URL("../build/data/", import.meta.url);

async function readCollection(url, key) {
  const parsed = await Bun.file(url).json();
  const collection = parsed[key];
  if (!Array.isArray(collection)) {
    throw new TypeError(`Expected an array at ${url.pathname}#${key}`);
  }
  return collection;
}

function sourceId(record, index) {
  return Number.isInteger(record?.id) || Number.isInteger(record?._id)
    ? (record.id ?? record._id)
    : index + 1;
}

function normalizeRelation(record, index, kind) {
  const kataA = displayWord(record.kata_a ?? record.word);
  const kataB = displayWord(record.kata_b ?? record.wrong);
  if (!normalizeWord(kataA) || !normalizeWord(kataB)) {
    throw new Error(`Invalid ${kind} relation at index ${index}`);
  }
  return {
    id: sourceId(record, index),
    word: kataA,
    wrong: kataB,
    normalizedWord: normalizeWord(kataA),
    normalizedWrong: normalizeWord(kataB),
    type: record.jenis ?? null,
    oppositionType: record.jenis_oposisi ?? null,
    field: record.bidang ?? null,
    confidence: record.tingkat_keyakinan ?? null,
    explanation: String(record.penjelasan ?? record.explain ?? "").trim(),
    usageA: String(record.penggunaan_a ?? "").trim(),
    usageB: String(record.penggunaan_b ?? "").trim(),
    clue: record.clue == null ? null : String(record.clue).trim(),
    note: record.catatan == null ? null : String(record.catatan).trim(),
  };
}

function buildRelated(entries, relations, slugMap) {
  const relatedByWord = new Map(entries.map((entry) => [entry.normalizedWord, new Map()]));
  const add = (left, right, kind) => {
    const leftMap = relatedByWord.get(left.normalizedWord);
    const rightMap = relatedByWord.get(right.normalizedWord);
    if (leftMap && rightMap && left.normalizedWord !== right.normalizedWord) {
      leftMap.set(right.normalizedWord, {
        word: right.word,
        slug: slugMap.get(right.normalizedWord),
        kind,
      });
      rightMap.set(left.normalizedWord, {
        word: left.word,
        slug: slugMap.get(left.normalizedWord),
        kind,
      });
    }
  };

  for (const relation of relations.baku) {
    add(
      { normalizedWord: relation.normalizedWord, word: relation.word },
      { normalizedWord: relation.normalizedWrong, word: relation.wrong },
      "Baku & nonbaku",
    );
  }
  for (const relation of relations.sinonim) {
    add(
      { normalizedWord: relation.normalizedWord, word: relation.word },
      { normalizedWord: relation.normalizedWrong, word: relation.wrong },
      "Sinonim",
    );
  }
  for (const relation of relations.antonim) {
    add(
      { normalizedWord: relation.normalizedWord, word: relation.word },
      { normalizedWord: relation.normalizedWrong, word: relation.wrong },
      "Antonim",
    );
  }

  return new Map(
    [...relatedByWord].map(([word, values]) => [
      word,
      [...values.values()].sort(
        (left, right) =>
          left.word.localeCompare(right.word, "id") || left.kind.localeCompare(right.kind, "id"),
      ),
    ]),
  );
}

function makeDefinition(record) {
  const html = sanitizeDefinition(record.arti);
  const text = definitionToText(html);
  if (!text) throw new Error(`Dictionary definition ${record._id} is empty`);
  return { id: record._id, type: record.type ?? null, html, text };
}

async function main() {
  const [rawDictionary, rawBaku, rawSinonim, rawAntonim] = await Promise.all([
    readCollection(sourcePaths.dictionary, "dictionary"),
    readCollection(sourcePaths.baku, "quiz_baku"),
    readCollection(sourcePaths.sinonim, "dictionary_sinonim"),
    readCollection(sourcePaths.antonim, "dictionary_antonim"),
  ]);

  const groups = groupDictionaryRecords(
    [...rawDictionary].sort((left, right) => Number(left._id) - Number(right._id)),
  );
  const slugData = createSlugMap(groups.map((group) => group.normalizedWord));
  const relations = {
    baku: rawBaku.map((record, index) => normalizeRelation(record, index, "baku")),
    sinonim: rawSinonim.map((record, index) => normalizeRelation(record, index, "sinonim")),
    antonim: rawAntonim.map((record, index) => normalizeRelation(record, index, "antonim")),
  };

  const entries = groups.map((group) => ({
    id: group.records[0]._id,
    word: group.word,
    normalizedWord: group.normalizedWord,
    slug: slugData.wordToSlug.get(group.normalizedWord),
    letter: wordLetter(group.normalizedWord),
    tokenText: tokenText(group.normalizedWord),
    definitions: group.records.map(makeDefinition),
  }));
  const related = buildRelated(entries, relations, slugData.wordToSlug);
  for (const entry of entries) entry.related = related.get(entry.normalizedWord) ?? [];

  const letters = {};
  for (const entry of entries) (letters[entry.letter] ??= []).push(entry.slug);

  const data = {
    version: 1,
    stats: {
      dictionaryRecords: rawDictionary.length,
      uniqueHeadwords: entries.length,
      duplicateRecords: rawDictionary.length - entries.length,
      bakuRecords: relations.baku.length,
      sinonimRecords: relations.sinonim.length,
      antonimRecords: relations.antonim.length,
      slugCollisionCount: slugData.collisionCount,
    },
    entries,
    letters,
    relations,
  };
  const wordMap = {
    normalizedToSlug: Object.fromEntries(slugData.wordToSlug),
    slugToNormalized: Object.fromEntries(slugData.slugToWord),
  };

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(new URL("site.json", outputDirectory), JSON.stringify(data), "utf8"),
    writeFile(new URL("word-map.json", outputDirectory), JSON.stringify(wordMap), "utf8"),
  ]);

  const summary = {
    ...data.stats,
    letters: Object.fromEntries(
      Object.entries(letters).map(([letter, slugs]) => [letter, slugs.length]),
    ),
    sampleSummary: truncateText(entries[0].definitions[0].text),
  };
  console.log(`DATA_METRICS ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
