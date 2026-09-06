import { mkdir, rm, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
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
  etymology: new URL("data/etymology-db/etymology_db_indonesian__JSON.json", root),
  kaikki: new URL("data/kaikki/kaikki.org-dictionary-Indonesian.jsonl.gz", root),
};
const outputDirectory = new URL("../build/data/", import.meta.url);

const FAMILY_MEMBER_LIMIT = 40;
const EXTRAS_LIMITS = { examples: 12, derivations: 30, compounds: 40, proverbs: 12, idioms: 12 };
const KAIKKI_LIMITS = {
  forms: 16,
  derived: 24,
  synonyms: 16,
  pronunciations: 4,
  hyphenations: 4,
};
const KAIKKI_POS_LABELS = {
  adj: "Adjektiva",
  adv: "Adverbia",
  article: "Artikel",
  character: "Huruf",
  classifier: "Penggolong",
  conjunction: "Konjungsi",
  conj: "Konjungsi",
  circumfix: "Konfiks",
  det: "Determiner",
  infix: "Infiks",
  interj: "Interjeksi",
  intj: "Interjeksi",
  name: "Nama diri",
  noun: "Nomina",
  num: "Numeralia",
  particle: "Partikel",
  phrase: "Frasa",
  post: "Postposisi",
  postp: "Postposisi",
  prefix: "Prefiks",
  prep: "Preposisi",
  prep_phrase: "Frasa preposisional",
  pron: "Pronomina",
  proverb: "Peribahasa",
  root: "Akar kata",
  suffix: "Sufiks",
  symbol: "Simbol",
  verb: "Verba",
};

async function readCollection(url, key) {
  const parsed = await Bun.file(url).json();
  const collection = key ? parsed[key] : parsed;
  if (!Array.isArray(collection)) {
    throw new TypeError(`Expected an array at ${url.pathname}${key ? `#${key}` : ""}`);
  }
  return collection;
}

async function readJsonLinesGzip(url) {
  const text = gunzipSync(Buffer.from(await Bun.file(url).arrayBuffer())).toString("utf8");
  return text
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at ${url.pathname}, line ${index + 1}`, { cause: error });
      }
    });
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

function normalizeEtymologyRelation(record, index) {
  const term = displayWord(record?.term);
  const termId = cleanText(record?.term_id);
  const lang = cleanText(record?.lang);
  const relationType = cleanText(record?.reltype);
  if (!term || !normalizeWord(term) || !termId || !lang || !relationType) {
    throw new Error(`Invalid etymology relation at index ${index}`);
  }
  const nullableText = (value) => {
    const text = cleanText(value);
    return text || null;
  };
  const nullableInteger = (value) => (Number.isInteger(value) ? value : null);
  return {
    id: index + 1,
    termId,
    lang,
    term,
    normalizedTerm: normalizeWord(term),
    relationType,
    relatedTermId: nullableText(record.related_term_id),
    relatedLang: nullableText(record.related_lang),
    relatedTerm: nullableText(record.related_term),
    position: nullableInteger(record.position),
    groupTag: nullableText(record.group_tag),
    parentTag: nullableText(record.parent_tag),
    parentPosition: nullableInteger(record.parent_position),
  };
}

function uniqueText(values) {
  const seen = new Set();
  return values
    .map((value) => cleanText(value))
    .filter((value) => value && !seen.has(value) && seen.add(value));
}

function normalizeSyllabification(value) {
  return cleanText(value).replace(/[.‧]/gu, "·");
}

function syllabifiedHeadword(text, word) {
  const pattern = [...word]
    .map((character) => {
      const escaped = character.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      if (/\p{L}|\p{N}/u.test(character)) return `${escaped}[·.]?`;
      return /\s/u.test(character) ? "\\s+" : escaped;
    })
    .join("");
  const candidate = text.match(new RegExp(`^\\d*(${pattern})`, "iu"))?.[1] ?? "";
  return /[·.]/u.test(candidate) ? normalizeSyllabification(candidate) : null;
}

function normalizeKaikkiEntry(record, index) {
  if (record?.lang_code !== "id") return null;
  const word = displayWord(record.word);
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) throw new Error(`Invalid Kaikki entry at index ${index}`);
  const forms = (Array.isArray(record.forms) ? record.forms : [])
    .map((form) => ({
      text: displayWord(form?.form),
      tags: uniqueText(Array.isArray(form?.tags) ? form.tags : []),
    }))
    .filter((form) => form.text)
    .slice(0, KAIKKI_LIMITS.forms);
  const pronunciations = uniqueText(
    (Array.isArray(record.sounds) ? record.sounds : []).map((sound) => sound?.ipa),
  ).slice(0, KAIKKI_LIMITS.pronunciations);
  const hyphenations = uniqueText([
    ...(Array.isArray(record.hyphenation) ? record.hyphenation : []),
    ...(Array.isArray(record.hyphenations) ? record.hyphenations : []).map((item) =>
      Array.isArray(item?.parts) ? item.parts.join("·") : "",
    ),
  ])
    .map(normalizeSyllabification)
    .slice(0, KAIKKI_LIMITS.hyphenations);
  const derived = uniqueText(
    (Array.isArray(record.derived) ? record.derived : []).map((item) => item?.word),
  ).slice(0, KAIKKI_LIMITS.derived);
  const synonyms = uniqueText(
    (Array.isArray(record.senses) ? record.senses : []).flatMap((sense) =>
      Array.isArray(sense?.synonyms) ? sense.synonyms.map((item) => item?.word) : [],
    ),
  ).slice(0, KAIKKI_LIMITS.synonyms);
  return {
    id: index + 1,
    word,
    normalizedWord,
    partOfSpeech:
      cleanText(record.pos_title) ||
      KAIKKI_POS_LABELS[record.pos] ||
      cleanText(record.pos) ||
      "Kelas kata tidak diketahui",
    etymology: cleanText(record.etymology_text) || null,
    pronunciations,
    hyphenations,
    forms,
    derived,
    synonyms,
  };
}

function buildKaikkiEntries(records, canonicalWords) {
  return records
    .map(normalizeKaikkiEntry)
    .filter(
      (entry) =>
        entry &&
        canonicalWords.has(entry.normalizedWord) &&
        (entry.etymology ||
          entry.pronunciations.length > 0 ||
          entry.hyphenations.length > 0 ||
          entry.forms.length > 0 ||
          entry.derived.length > 0 ||
          entry.synonyms.length > 0),
    );
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
    rawEtymology,
    rawKaikki,
  ] = await Promise.all([
    readCollection(sourcePaths.dictionary, "dictionary"),
    readCollection(sourcePaths.baku, "quiz_baku"),
    readCollection(sourcePaths.sinonim, "dictionary_sinonim"),
    readCollection(sourcePaths.antonim, "dictionary_antonim"),
    readCollection(sourcePaths.enrichment, "dictionary_enrichment"),
    readCollection(sourcePaths.indolex, "indolex"),
    readCollection(sourcePaths.alay, "dictionary_kamus_alay"),
    readCollection(sourcePaths.v6, null),
    readCollection(sourcePaths.etymology, "etymology_db_indonesian"),
    readJsonLinesGzip(sourcePaths.kaikki),
  ]);

  const groups = groupDictionaryRecords(
    [...rawDictionary].sort((left, right) => Number(left._id) - Number(right._id)),
  );
  const slugData = createSlugMap(groups.map((group) => group.normalizedWord));
  const canonicalWords = new Set(groups.map((group) => group.normalizedWord));
  const relations = {
    baku: rawBaku.map((record, index) => normalizeRelation(record, index, "baku")),
    sinonim: rawSinonim.map((record, index) => normalizeRelation(record, index, "sinonim")),
    antonim: rawAntonim.map((record, index) => normalizeRelation(record, index, "antonim")),
    slang: rawAlay.map((record, index) => normalizeSlangRelation(record, index)),
    etymology: rawEtymology.map(normalizeEtymologyRelation),
  };
  const etymology = relations.etymology;
  const kaikki = buildKaikkiEntries(rawKaikki, canonicalWords);
  const enrichmentByWord = buildEnrichmentIndex(rawEnrichment);
  const formsByRoot = buildFormsByRoot(rawIndolex);
  const families = buildFamilies(formsByRoot, slugData.wordToSlug);
  const extrasByWord = buildV6Extras(rawV6, slugData.wordToSlug);

  const entries = groups.map((group) => {
    const enrichment = enrichmentByWord.get(group.normalizedWord) ?? null;
    const definitions = group.records.map(makeDefinition);
    return {
      id: group.records[0]._id,
      word: group.word,
      normalizedWord: group.normalizedWord,
      slug: slugData.wordToSlug.get(group.normalizedWord),
      letter: wordLetter(group.normalizedWord),
      tokenText: tokenText(group.normalizedWord),
      definitions,
      syllabifications: uniqueText(
        definitions.map((definition) => syllabifiedHeadword(definition.text, group.word)),
      ),
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
      etymologyRecords: rawEtymology.length,
      etymologyTerms: new Set(etymology.map((relation) => relation.normalizedTerm)).size,
      etymologyLinkedTerms: new Set(
        etymology
          .filter((relation) => relation.relatedTerm)
          .map((relation) => relation.normalizedTerm),
      ).size,
      kaikkiRecords: kaikki.length,
      kaikkiTerms: new Set(kaikki.map((entry) => entry.normalizedWord)).size,
      kaikkiEtymologyTerms: new Set(
        kaikki.filter((entry) => entry.etymology).map((entry) => entry.normalizedWord),
      ).size,
      kaikkiHyphenationTerms: new Set(
        kaikki.filter((entry) => entry.hyphenations.length).map((entry) => entry.normalizedWord),
      ).size,
    },
    entries,
    letters,
    relations,
    kaikki,
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
