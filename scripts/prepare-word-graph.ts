// Menambang korpus Leipzig menjadi data graf kata per headword Tutur:
// kata yang muncul dalam kalimat yang sama, tetangga kiri/kanan, pasangan
// kalimat contoh, dan edge antar-node untuk graf.
//
// Rollup morfologis: bentuk inflektif korpus dipetakan ke root headword
// lewat data/indolex/indolex__JSON.json (mis. "dimarahi" -> "marah"),
// sehingga graf mencakup headword yang hanya muncul sebagai turunan.
//
// Input : data/leipzig/*.json (opsional; lihat scripts/fetch-leipzig.ts),
//         data/indolex/indolex__JSON.json, build/data/word-map.json
// Output: build/data/word_graph.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { normalizeWord } from "../shared/src/normalization.ts";
import type { PreparedEntry } from "@tutur/shared/types";

const root = new URL("../", import.meta.url);

const MAX_NODES = 14;
const MAX_NEIGHBOURS = 10;
const MAX_SENTENCES = 5;
const MAX_SENTENCE_LENGTH = 200;
const MIN_TOKEN_LENGTH = 2;
const MAX_SURFACES_PER_ANCHOR = 60;

interface LeipzigWord {
  id: number;
  word: string;
  frequency: number;
}

interface CoPair {
  word1_id: number;
  word2_id: number;
  frequency: number;
  significance: number;
}

interface Agg {
  frequency: number;
  significance: number;
  other: string;
}

export interface GraphNode {
  word: string;
  id: number;
  norm: string;
  freq: number;
  sig: number;
  slug: string | null;
}

export interface WordGraphData {
  word: string;
  freq: number;
  anchorId: number;
  sentences: number;
  nodes: GraphNode[];
  edges: [number, number, number][];
  left: GraphNode[];
  right: GraphNode[];
  examples: string[];
}

async function readJson<T>(path: string): Promise<T> {
  return readFile(new URL(path, root), "utf8").then((text) => JSON.parse(text) as T);
}

const [siteFile, wordMapFile, indolexFile] = await Promise.all([
  readJson<{ entries: PreparedEntry[] }>("build/data/site.json"),
  readJson<{ normalizedToSlug: Record<string, string> }>("build/data/word-map.json"),
  readJson<{ indolex: Array<{ word: string; root: string }> }>(
    "data/indolex/indolex__JSON.json",
  ).catch(() => ({ indolex: [] as Array<{ word: string; root: string }> })),
]);

const slugByNorm = new Map(
  siteFile.entries.map((entry) => [entry.normalizedWord, entry.slug] as const),
);

// Rollup morfologis: bentuk -> root yang merupakan headword.
const rootByForm = new Map<string, string>();
for (const row of indolexFile.indolex) {
  const form = normalizeWord(row.word);
  const rootNorm = normalizeWord(row.root);
  if (form === rootNorm || !slugByNorm.has(rootNorm)) continue;
  if (!rootByForm.has(form)) rootByForm.set(form, rootNorm);
}

const resolve = (norm: string): string | null => {
  if (slugByNorm.has(norm)) return norm;
  return rootByForm.get(norm) ?? null;
};

let leipzigWords: LeipzigWord[] = [];
let sentenceRows: { id: number; text: string }[] = [];
let sentencePairs: CoPair[] = [];
let neighbourPairs: CoPair[] = [];
let corpusAvailable = true;
try {
  const [wordsFile, sentencesFile, sentenceCoFile, neighbourFile] = await Promise.all([
    readJson<{ leipzig_words: LeipzigWord[] }>("data/leipzig/leipzig_words__JSON.json"),
    readJson<{ leipzig_sentences: { id: number; text: string }[] }>(
      "data/leipzig/leipzig_sentences__JSON.json",
    ),
    readJson<{ leipzig_sentence_cooccurrences: CoPair[] }>(
      "data/leipzig/leipzig_sentence_cooccurrences__JSON.json",
    ),
    readJson<{ leipzig_neighbour_cooccurrences: CoPair[] }>(
      "data/leipzig/leipzig_neighbour_cooccurrences__JSON.json",
    ),
  ]);
  leipzigWords = wordsFile.leipzig_words;
  sentenceRows = sentencesFile.leipzig_sentences;
  sentencePairs = sentenceCoFile.leipzig_sentence_cooccurrences;
  neighbourPairs = neighbourFile.leipzig_neighbour_cooccurrences;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  corpusAvailable = false;
  console.warn(
    "WARN data/leipzig tidak ditemukan — jalankan scripts/fetch-leipzig.ts untuk mengisi graf kata.",
  );
}

const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

function bucketOf(map: Map<string, Map<string, Agg>>, key: string): Map<string, Agg> {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Map<string, Agg>();
    map.set(key, bucket);
  }
  return bucket;
}

function pushAgg(bucket: Map<string, Agg>, other: string, pair: CoPair): void {
  const current = bucket.get(other);
  if (!current) {
    bucket.set(other, {
      frequency: pair.frequency,
      significance: pair.significance,
      other,
    });
    return;
  }
  current.frequency += pair.frequency;
  current.significance = Math.max(current.significance, pair.significance);
}

const graphs: Record<string, WordGraphData> = {};
const graphStats = { nodes: 0, edges: 0, examples: 0 };

if (corpusAvailable) {
  // id korpus -> norm permukaan, lalu -> norm headword (rollup indolex).
  const wordsById = new Map(leipzigWords.map((word) => [word.id, word]));
  const normById = new Map<number, string>();
  const surfaces = new Map<string, { id: number; word: string; frequency: number }>();
  for (const word of leipzigWords) {
    const norm = normalizeWord(word.word);
    if (norm.length < MIN_TOKEN_LENGTH) continue;
    normById.set(word.id, norm);
    const existing = surfaces.get(norm);
    if (!existing) {
      surfaces.set(norm, { id: word.id, word: word.word, frequency: word.frequency });
    } else if (word.frequency > existing.frequency) {
      existing.id = word.id;
      existing.word = word.word;
      existing.frequency = word.frequency;
    }
  }

  const coByNorm = new Map<string, Map<string, Agg>>();
  const leftByNorm = new Map<string, Map<string, Agg>>();
  const rightByNorm = new Map<string, Map<string, Agg>>();
  const pairWeight = new Map<string, number>();

  for (const pair of sentencePairs) {
    const leftNorm = normById.get(pair.word1_id);
    const rightNorm = normById.get(pair.word2_id);
    if (!leftNorm || !rightNorm) continue;
    const leftKey = resolve(leftNorm) ?? leftNorm;
    const rightKey = resolve(rightNorm) ?? rightNorm;
    if (leftKey.length < MIN_TOKEN_LENGTH || rightKey.length < MIN_TOKEN_LENGTH) continue;
    if (leftKey === rightKey) continue;
    pairWeight.set(pairKey(leftKey, rightKey), pair.frequency);
    pushAgg(bucketOf(coByNorm, leftKey), rightKey, pair);
    pushAgg(bucketOf(coByNorm, rightKey), leftKey, pair);
  }

  for (const pair of neighbourPairs) {
    const leftNorm = normById.get(pair.word1_id);
    const rightNorm = normById.get(pair.word2_id);
    if (!leftNorm || !rightNorm) continue;
    const leftKey = resolve(leftNorm) ?? leftNorm;
    const rightKey = resolve(rightNorm) ?? rightNorm;
    if (leftKey.length < MIN_TOKEN_LENGTH || rightKey.length < MIN_TOKEN_LENGTH) continue;
    if (leftKey === rightKey) continue;
    // word1 berada di kiri word2 (format sumber kiri-ke-kanan).
    pushAgg(bucketOf(rightByNorm, leftKey), rightKey, pair);
    pushAgg(bucketOf(leftByNorm, rightKey), leftKey, pair);
  }

  // Contoh kalimat + hitungan kalimat, diatribusikan ke headword hasil rollup.
  const sentenceCount = new Map<string, number>();
  const sentenceCandidates = new Map<string, string[]>();
  const surfacesPerAnchor = new Map<string, Set<string>>();
  for (const sentence of sentenceRows) {
    const anchorsInSentence = new Set<string>();
    for (const token of sentence.text.split(/\s+/u)) {
      const resolved = resolve(normalizeWord(token));
      if (!resolved || resolved.length < MIN_TOKEN_LENGTH) continue;
      anchorsInSentence.add(resolved);
      if (anchorsInSentence.size > 8) break;
      const surfaceSet = surfacesPerAnchor.get(resolved);
      if (surfaceSet && surfaceSet.size < MAX_SURFACES_PER_ANCHOR) {
        surfaceSet.add(token.toLocaleLowerCase("id-ID"));
      }
    }
    for (const anchor of anchorsInSentence) {
      sentenceCount.set(anchor, (sentenceCount.get(anchor) ?? 0) + 1);
      if (sentence.text.length <= MAX_SENTENCE_LENGTH) {
        const list = sentenceCandidates.get(anchor);
        if (list) {
          if (list.length < MAX_SENTENCES * 4) list.push(sentence.text);
        } else {
          sentenceCandidates.set(anchor, [sentence.text]);
        }
      }
    }
  }

  const corpusSentences = (norm: string, groupSurfaces: Iterable<string>): string[] => {
    const patternText = [...new Set(groupSurfaces)]
      .map((surface) => surface.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
      .join("|");
    const pattern = patternText ? new RegExp(`\\b(${patternText})\\b`, "giu") : null;
    const candidates = sentenceCandidates.get(norm) ?? [];
    const unique = new Set<string>();
    const output: string[] = [];
    for (const text of candidates) {
      const marked = pattern ? text.replace(pattern, (match) => `«${match}»`) : text;
      if (marked === text || unique.has(marked)) continue;
      unique.add(marked);
      output.push(marked);
      if (output.length >= MAX_SENTENCES) break;
    }
    return output;
  };

  const graphNode = (norm: string, sig: number, freq: number): GraphNode | null => {
    if (norm.length < MIN_TOKEN_LENGTH) return null;
    const surface = surfaces.get(norm);
    return {
      word: surface?.word ?? norm,
      id: surface?.id ?? 0,
      norm,
      freq: surface?.frequency ?? freq,
      sig: Number(sig.toFixed(2)),
      slug: slugByNorm.get(norm) ?? null,
    };
  };

  for (const [norm, bucket] of coByNorm) {
    const slug = slugByNorm.get(norm);
    if (!slug) continue;
    const anchorSurface = surfaces.get(norm);
    const anchorId = anchorSurface?.id ?? 0;

    const nodes: GraphNode[] = [...bucket.values()]
      .filter((entry) => entry.other !== norm)
      .sort(
        (left, right) => right.significance - left.significance || right.frequency - left.frequency,
      )
      .slice(0, MAX_NODES)
      .map((entry) => graphNode(entry.other, entry.significance, entry.frequency))
      .filter((node): node is GraphNode => node !== null);

    const chosen = [
      { id: anchorSurface?.id ?? 0, norm },
      ...nodes.map((node) => ({ id: node.id, norm: node.norm })),
    ];
    const edges: [number, number, number][] = [];
    for (let i = 0; i < chosen.length; i += 1) {
      for (let j = i + 1; j < chosen.length; j += 1) {
        const frequency = pairWeight.get(pairKey(chosen[i]!.norm, chosen[j]!.norm));
        if (frequency) edges.push([chosen[i]!.id, chosen[j]!.id, frequency]);
      }
    }
    edges.sort((left, right) => right[2] - left[2]);

    const neighboursFor = (side: "left" | "right"): GraphNode[] =>
      [...((side === "left" ? leftByNorm : rightByNorm).get(norm)?.values() ?? [])]
        .filter((entry) => entry.other !== norm)
        .sort(
          (left, right) =>
            right.significance - left.significance || right.frequency - left.frequency,
        )
        .slice(0, MAX_NEIGHBOURS)
        .map((entry) => graphNode(entry.other, entry.significance, entry.frequency))
        .filter((node): node is GraphNode => node !== null);

    const groupSurfaces = surfacesPerAnchor.get(norm) ?? new Set<string>();
    if (anchorSurface) groupSurfaces.add(anchorSurface.word.toLocaleLowerCase("id-ID"));

    graphs[slug] = {
      word: anchorSurface?.word ?? norm,
      freq: anchorSurface?.frequency ?? 0,
      anchorId,
      sentences: sentenceCount.get(norm) ?? 0,
      nodes,
      edges,
      left: neighboursFor("left"),
      right: neighboursFor("right"),
      examples: corpusSentences(norm, groupSurfaces),
    };
    graphStats.nodes += nodes.length;
    graphStats.edges += edges.length;
    graphStats.examples += graphs[slug]!.examples.length;
  }
}

const output = {
  corpus: corpusAvailable ? "ind_mixed_2013" : null,
  anchors: Object.keys(graphs).length,
  graphs,
};
const outputDirectory = new URL("build/data/", root);
await mkdir(outputDirectory, { recursive: true });
const text = JSON.stringify(output);
await writeFile(new URL("word_graph.json", outputDirectory), text);
console.log(
  `GRAPH_METRICS ${JSON.stringify({
    corpusAvailable,
    anchors: output.anchors,
    nodes: graphStats.nodes,
    edges: graphStats.edges,
    examples: graphStats.examples,
    megabytes: Number((Buffer.byteLength(text) / 1024 / 1024).toFixed(2)),
  })}`,
);
