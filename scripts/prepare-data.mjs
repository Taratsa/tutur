import { mkdir, rm, writeFile } from "node:fs/promises";
import { createSlugMap } from "../shared/src/slug.ts";
import { groupDictionaryRecords } from "../shared/src/grouping.ts";
import { definitionToText, sanitizeDefinition, truncateText } from "../shared/src/sanitize.ts";
import { displayWord, normalizeWord, tokenText, wordLetter } from "../shared/src/normalization.ts";

const root = new URL("../", import.meta.url);
const sourcePaths = {
  dictionary: new URL("data/edisi-IV/dictionary__JSON.json", root),
  baku: new URL("data/baku-nonbaku/dictionary_baku_nonbaku__JSON.json", root),
  sinonim: new URL("data/sinonim/dictionary_sinonim__JSON.json", root),
  antonim: new URL("data/antonim/dictionary_antonim__JSON.json", root),
  enrichment: new URL("data/indolex/kbbi_edisi_iv_enrichment__JSON.json", root),
  indolex: new URL("data/indolex/indolex__JSON.json", root),
  alay: new URL("data/kamus-alay/dictionary_kamus_alay__JSON.json", root),
  v6: new URL("data/kbbi-v6/kbbi_v6__JSON.json", root),
};
const outputDirectory = new URL("../build/data/", import.meta.url);

const FAMILY_MEMBER_LIMIT = 40;
const EXTRAS_LIMITS = { examples: 12, derivations: 30, compounds: 40, proverbs: 12, idioms: 12 };

async function readCollection(url, key) {
  const parsed = await Bun.file(url).json();
  const collection = key ? parsed[key] : parsed;
  if (!Array.isArray(collection)) {
    throw new TypeError(`Expected an array at ${url.pathname}${key ? `#${key}` : ""}`);
  }
  return collection;
}

function sourceId(record, index) {
  return Number.isInteger(record?.id) || Number.isInteger(record?._id)
    ? (record.id ?? record._id)
    : index + 1;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
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

function normalizeSlangRelation(record, index) {
  const slang = displayWord(record.slang);
  const formal = displayWord(record.formal);
  if (!normalizeWord(slang) || !normalizeWord(formal)) {
    throw new Error(`Invalid slang relation at index ${index}`);
  }
  const categories = (Array.isArray(record.categories) ? record.categories : [])
    .map((item) => cleanText(item))
    .filter(Boolean);
  return {
    id: sourceId(record, index),
    slang,
    normalizedSlang: normalizeWord(slang),
    formal,
    normalizedFormal: normalizeWord(formal),
    inDictionary: Boolean(record.in_dictionary),
    categories,
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

function buildEnrichmentIndex(records) {
  const enrichmentByWord = new Map();
  for (const record of records) {
    const key = normalizeWord(record?.word);
    if (!key || enrichmentByWord.has(key)) continue;
    enrichmentByWord.set(key, {
      frequency: Number(record.frequency ?? 0),
      root: cleanText(record.root),
      rootRank: Number.isInteger(record.root_rank) ? record.root_rank : null,
      rootFrequency: Number.isInteger(record.root_frequency) ? record.root_frequency : null,
    });
  }
  return enrichmentByWord;
}

function buildFormsByRoot(records) {
  const formsByRoot = new Map();
  for (const record of records) {
    const normalizedRoot = normalizeWord(record?.root);
    const normalizedForm = normalizeWord(record?.word);
    if (!normalizedRoot || !normalizedForm) continue;
    let bucket = formsByRoot.get(normalizedRoot);
    if (!bucket) {
      bucket = new Map();
      formsByRoot.set(normalizedRoot, bucket);
    }
    const frequency = Number(record.frequency ?? 0);
    const existing = bucket.get(normalizedForm);
    if (!existing || frequency > existing.frequency) {
      bucket.set(normalizedForm, {
        word: displayWord(record.word),
        normalized: normalizedForm,
        frequency,
      });
    }
  }
  return formsByRoot;
}

function buildFamilies(formsByRoot, slugMap) {
  const families = [];
  for (const [normalizedRoot, bucket] of formsByRoot) {
    const rootSlug = slugMap.get(normalizedRoot);
    if (!rootSlug) continue;
    const members = [...bucket.values()]
      .filter((member) => member.normalized !== normalizedRoot)
      .sort(
        (left, right) =>
          right.frequency - left.frequency || left.word.localeCompare(right.word, "id"),
      )
      .slice(0, FAMILY_MEMBER_LIMIT)
      .map((member) => ({
        text: member.word,
        slug: slugMap.get(member.normalized) ?? null,
        frequency: member.frequency,
      }));
    if (members.length) families.push({ root: normalizedRoot, rootSlug, members });
  }
  return families.sort((left, right) =>
    left.root < right.root ? -1 : left.root > right.root ? 1 : 0,
  );
}

function createExtras() {
  return {
    pronunciation: "",
    etymology: "",
    examples: new Set(),
    derivations: new Set(),
    compounds: new Set(),
    proverbs: new Set(),
    idioms: new Set(),
  };
}

function absorbExtras(extras, record) {
  if (!extras.pronunciation) extras.pronunciation = cleanText(record.pelafalan);
  if (!extras.etymology) extras.etymology = cleanText(record.etimologi);
  const absorb = (key, values) => {
    if (!Array.isArray(values)) return;
    for (const value of values) {
      const text = cleanText(value);
      if (text) extras[key].add(text);
    }
  };
  absorb("examples", record.contoh);
  absorb("derivations", record.turunan);
  absorb("compounds", record.gabungan_kata);
  absorb("proverbs", record.peribahasa);
  absorb("idioms", record.kiasan);
}

function finalizeExtras(extras, slugMap) {
  const toList = (values, limit, withSlug) => {
    const output = [];
    for (const text of values) {
      output.push(
        withSlug ? { text, slug: slugMap.get(normalizeWord(text)) ?? null } : { text, slug: null },
      );
      if (output.length >= limit) break;
    }
    return output;
  };
  return {
    pronunciation: extras.pronunciation || null,
    etymology: extras.etymology || null,
    examples: toList(extras.examples, EXTRAS_LIMITS.examples, false),
    derivations: toList(extras.derivations, EXTRAS_LIMITS.derivations, true),
    compounds: toList(extras.compounds, EXTRAS_LIMITS.compounds, true),
    proverbs: toList(extras.proverbs, EXTRAS_LIMITS.proverbs, false),
    idioms: toList(extras.idioms, EXTRAS_LIMITS.idioms, false),
  };
}

function buildV6Extras(records, slugMap) {
  const extrasByWord = new Map();
  for (const record of records) {
    const normalizedWord = normalizeWord(record?.kata);
    if (!normalizedWord) continue;
    let extras = extrasByWord.get(normalizedWord);
    if (!extras) {
      extras = createExtras();
      extrasByWord.set(normalizedWord, extras);
    }
    absorbExtras(extras, record);
  }
  return new Map(
    [...extrasByWord].map(([word, extras]) => [word, finalizeExtras(extras, slugMap)]),
  );
}

function makeDefinition(record) {
  const html = sanitizeDefinition(record.arti);
  const text = definitionToText(html);
  if (!text) throw new Error(`Dictionary definition ${record._id} is empty`);
  return { id: record._id, type: record.type ?? null, html, text };
}

async function main() {
  const [
    rawDictionary,
    rawBaku,
    rawSinonim,
    rawAntonim,
    rawEnrichment,
    rawIndolex,
    rawAlay,
    rawV6,
  ] = await Promise.all([
    readCollection(sourcePaths.dictionary, "dictionary"),
    readCollection(sourcePaths.baku, "quiz_baku"),
    readCollection(sourcePaths.sinonim, "dictionary_sinonim"),
    readCollection(sourcePaths.antonim, "dictionary_antonim"),
    readCollection(sourcePaths.enrichment, "dictionary_enrichment"),
    readCollection(sourcePaths.indolex, "indolex"),
    readCollection(sourcePaths.alay, "dictionary_kamus_alay"),
    readCollection(sourcePaths.v6, null),
  ]);

  const groups = groupDictionaryRecords(
    [...rawDictionary].sort((left, right) => Number(left._id) - Number(right._id)),
  );
  const slugData = createSlugMap(groups.map((group) => group.normalizedWord));
  const relations = {
    baku: rawBaku.map((record, index) => normalizeRelation(record, index, "baku")),
    sinonim: rawSinonim.map((record, index) => normalizeRelation(record, index, "sinonim")),
    antonim: rawAntonim.map((record, index) => normalizeRelation(record, index, "antonim")),
    slang: rawAlay.map((record, index) => normalizeSlangRelation(record, index)),
  };
  const enrichmentByWord = buildEnrichmentIndex(rawEnrichment);
  const formsByRoot = buildFormsByRoot(rawIndolex);
  const families = buildFamilies(formsByRoot, slugData.wordToSlug);
  const extrasByWord = buildV6Extras(rawV6, slugData.wordToSlug);

  const entries = groups.map((group) => {
    const enrichment = enrichmentByWord.get(group.normalizedWord) ?? null;
    return {
      id: group.records[0]._id,
      word: group.word,
      normalizedWord: group.normalizedWord,
      slug: slugData.wordToSlug.get(group.normalizedWord),
      letter: wordLetter(group.normalizedWord),
      tokenText: tokenText(group.normalizedWord),
      definitions: group.records.map(makeDefinition),
      frequency: enrichment?.frequency ?? null,
      root: enrichment?.root || null,
      rootRank: enrichment?.rootRank ?? null,
      rootFrequency: enrichment?.rootFrequency ?? null,
      extras: extrasByWord.get(group.normalizedWord) ?? null,
    };
  });
  const related = buildRelated(entries, relations, slugData.wordToSlug);
  for (const entry of entries) entry.related = related.get(entry.normalizedWord) ?? [];

  const letters = {};
  for (const entry of entries) (letters[entry.letter] ??= []).push(entry.slug);

  const data = {
    version: 2,
    stats: {
      dictionaryRecords: rawDictionary.length,
      uniqueHeadwords: entries.length,
      duplicateRecords: rawDictionary.length - entries.length,
      bakuRecords: relations.baku.length,
      sinonimRecords: relations.sinonim.length,
      antonimRecords: relations.antonim.length,
      slangRecords: relations.slang.length,
      slugCollisionCount: slugData.collisionCount,
      enrichedWords: entries.filter((entry) => entry.frequency != null).length,
      extrasEntries: entries.filter((entry) => entry.extras).length,
      familyRoots: families.length,
      familyMembers: families.reduce((sum, family) => sum + family.members.length, 0),
    },
    entries,
    letters,
    relations,
    families,
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
