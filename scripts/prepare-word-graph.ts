// Menambang korpus Leipzig ind_mixed_2013_100K menjadi data graf kata per
// headword Tutur: kata yang muncul dalam kalimat yang sama, tetangga
// kiri/kanan, pasangan kalimat contoh, dan edge antar-node untuk graf.
// Input : data/leipzig/*.json, build/data/site.json
// Output: build/data/word_graph.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { normalizeWord } from "../shared/src/normalization.ts";

const root = new URL("../", import.meta.url);

const MAX_NODES = 14;
const MAX_NEIGHBOURS = 10;
const MAX_SENTENCES = 5;
const MAX_SENTENCE_LENGTH = 200;
const MIN_TOKEN_LENGTH = 2;

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

interface WordSentenceEntry {
  word_id: number;
  sentence_ids: number[];
}

interface Surface {
  id: number;
  word: string;
  frequency: number;
  norm: string;
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

interface LeipzigWordsFile {
  leipzig_words: LeipzigWord[];
}
interface LeipzigSentencesFile {
  leipzig_sentences: { id: number; text: string }[];
}
interface LeipzigCoFile {
  leipzig_sentence_cooccurrences?: CoPair[];
  leipzig_neighbour_cooccurrences?: CoPair[];
}
interface LeipzigIndexFile {
  leipzig_word_sentence_index: WordSentenceEntry[];
}
interface WordMapFile {
  normalizedToSlug: Record<string, string>;
}

const [wordsFile, sentencesFile, sentenceCoFile, neighbourFile, indexFile, wordMapFile] =
  await Promise.all([
    readJson<LeipzigWordsFile>("data/leipzig/leipzig_words__JSON.json"),
    readJson<LeipzigSentencesFile>("data/leipzig/leipzig_sentences__JSON.json"),
    readJson<LeipzigCoFile>("data/leipzig/leipzig_sentence_cooccurrences__JSON.json"),
    readJson<LeipzigCoFile>("data/leipzig/leipzig_neighbour_cooccurrences__JSON.json"),
    readJson<LeipzigIndexFile>("data/leipzig/leipzig_word_sentence_index__JSON.json"),
    readJson<WordMapFile>("build/data/word-map.json"),
  ]);

const leipzigWords = wordsFile.leipzig_words;
const sentenceText = new Map(sentencesFile.leipzig_sentences.map((s) => [s.id, s.text]));
const wordsById = new Map(leipzigWords.map((word) => [word.id, word]));
const slugByNorm = new Map(Object.entries(wordMapFile.normalizedToSlug));

// Bentuk permukaan korpus berbeda bisa dinormalkan ke headword yang sama
// ("Marah" dan "marah"): gabungkan, tampilkan yang berfrekuensi tertinggi.
const surfaces = new Map<string, Surface>();
const idsByNorm = new Map<string, number[]>();
for (const word of leipzigWords) {
  const norm = normalizeWord(word.word);
  if (norm.length < MIN_TOKEN_LENGTH) continue;
  const existing = surfaces.get(norm);
  if (!existing) {
    surfaces.set(norm, { id: word.id, word: word.word, frequency: word.frequency, norm });
  } else if (word.frequency > existing.frequency) {
    existing.id = word.id;
    existing.word = word.word;
    existing.frequency = word.frequency;
  }
  const bucket = idsByNorm.get(norm);
  if (bucket) bucket.push(word.id);
  else idsByNorm.set(norm, [word.id]);
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

// coByNorm  : norm -> pasangan dalam kalimat yang sama (dua arah)
// leftByNorm: norm -> kata yang muncul tepat sebelum norm
// rightByNorm: norm -> kata yang muncul tepat sesudah norm
const coByNorm = new Map<string, Map<string, Agg>>();
const leftByNorm = new Map<string, Map<string, Agg>>();
const rightByNorm = new Map<string, Map<string, Agg>>();
const coPairFrequency = new Map<string, number>();

for (const pair of sentenceCoFile.leipzig_sentence_cooccurrences ?? []) {
  const left = wordsById.get(pair.word1_id);
  const right = wordsById.get(pair.word2_id);
  if (!left || !right) continue;
  const leftNorm = normalizeWord(left.word);
  const rightNorm = normalizeWord(right.word);
  if (leftNorm.length < MIN_TOKEN_LENGTH || rightNorm.length < MIN_TOKEN_LENGTH) continue;
  if (leftNorm === rightNorm) continue;
  coPairFrequency.set(pairKey(pair.word1_id, pair.word2_id), pair.frequency);
  pushAgg(bucketOf(coByNorm, leftNorm), rightNorm, pair);
  pushAgg(bucketOf(coByNorm, rightNorm), leftNorm, pair);
}

for (const pair of neighbourFile.leipzig_neighbour_cooccurrences ?? []) {
  const left = wordsById.get(pair.word1_id);
  const right = wordsById.get(pair.word2_id);
  if (!left || !right) continue;
  const leftNorm = normalizeWord(left.word);
  const rightNorm = normalizeWord(right.word);
  if (leftNorm.length < MIN_TOKEN_LENGTH || rightNorm.length < MIN_TOKEN_LENGTH) continue;
  if (leftNorm === rightNorm) continue;
  // word1 berada di kiri word2 (format sumber kiri-ke-kanan).
  pushAgg(bucketOf(rightByNorm, leftNorm), rightNorm, pair);
  pushAgg(bucketOf(leftByNorm, rightNorm), leftNorm, pair);
}

const sentenceIdsByNorm = new Map<string, number[]>();
for (const entry of indexFile.leipzig_word_sentence_index) {
  const word = wordsById.get(entry.word_id);
  if (!word) continue;
  const norm = normalizeWord(word.word);
  const bucket = sentenceIdsByNorm.get(norm);
  if (bucket) for (const id of entry.sentence_ids) bucket.push(id);
  else sentenceIdsByNorm.set(norm, [...entry.sentence_ids]);
}

const corpusSentences = (norm: string, groupSurfaces: string[]): string[] => {
  const ids = sentenceIdsByNorm.get(norm) ?? [];
  const candidates: string[] = [];
  for (const id of ids) {
    const text = sentenceText.get(id);
    if (!text || text.length > MAX_SENTENCE_LENGTH) continue;
    candidates.push(text);
  }
  candidates.sort((left, right) => left.length - right.length);
  const patternText = [...new Set(groupSurfaces.map((surface) => surface.toLowerCase()))]
    .map((surface) => surface.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|");
  const pattern = patternText ? new RegExp(`\\b(${patternText})\\b`, "giu") : null;
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

const graphs: Record<string, WordGraphData> = {};
let anchors = 0;

for (const [norm, anchorSurface] of surfaces) {
  const slug = slugByNorm.get(norm);
  if (!slug) continue;
  anchors += 1;

  const partners = coByNorm.get(norm) ?? new Map<string, Agg>();
  const nodes: GraphNode[] = [...partners.values()]
    .sort(
      (left, right) => right.significance - left.significance || right.frequency - left.frequency,
    )
    .slice(0, MAX_NODES)
    .map((entry) => {
      const surface = surfaces.get(entry.other);
      return {
        word: surface?.word ?? entry.other,
        id: surface?.id ?? 0,
        norm: entry.other,
        freq: surface?.frequency ?? entry.frequency,
        sig: Number(entry.significance.toFixed(2)),
        slug: slugByNorm.get(entry.other) ?? null,
      };
    });

  // Edge antar pasangan node terpilih (termasuk anchor) dari frekuensi
  // co-occurrence korpus. Pasangan dicatat per tipe permukaan korpus, jadi
  // pencarian memakai semua varian id per normalized headword.
  const chosen: Array<{ id: number; norm: string }> = [
    { id: anchorSurface.id, norm },
    ...nodes.map((node) => ({ id: node.id, norm: node.norm })),
  ];
  const edges: [number, number, number][] = [];
  for (let i = 0; i < chosen.length; i += 1) {
    for (let j = i + 1; j < chosen.length; j += 1) {
      let frequency = 0;
      for (const idA of idsByNorm.get(chosen[i]!.norm) ?? []) {
        for (const idB of idsByNorm.get(chosen[j]!.norm) ?? []) {
          frequency =
            coPairFrequency.get(pairKey(idA, idB)) ?? coPairFrequency.get(pairKey(idB, idA)) ?? 0;
          if (frequency) break;
        }
        if (frequency) break;
      }
      if (frequency) edges.push([chosen[i]!.id, chosen[j]!.id, frequency]);
    }
  }
  edges.sort((left, right) => right[2] - left[2]);

  const neighboursFor = (side: "left" | "right"): GraphNode[] =>
    [...((side === "left" ? leftByNorm : rightByNorm).get(norm)?.values() ?? [])]
      .sort(
        (left, right) => right.significance - left.significance || right.frequency - left.frequency,
      )
      .slice(0, MAX_NEIGHBOURS)
      .map((entry) => {
        const surface = surfaces.get(entry.other);
        return {
          word: surface?.word ?? entry.other,
          id: surface?.id ?? 0,
          freq: entry.frequency,
          sig: Number(entry.significance.toFixed(2)),
          slug: slugByNorm.get(entry.other) ?? null,
        };
      });

  graphs[slug] = {
    word: anchorSurface.word,
    freq: anchorSurface.frequency,
    anchorId: anchorSurface.id,
    sentences: (sentenceIdsByNorm.get(norm) ?? []).length,
    nodes,
    edges,
    left: neighboursFor("left"),
    right: neighboursFor("right"),
    examples: corpusSentences(
      norm,
      (idsByNorm.get(norm) ?? [])
        .map((id) => wordsById.get(id)?.word)
        .filter((word): word is string => Boolean(word)),
    ),
  };
}

const output = { corpus: "ind_mixed_2013_100K", anchors, graphs };
const outputDirectory = new URL("build/data/", root);
await mkdir(outputDirectory, { recursive: true });
const text = JSON.stringify(output);
await writeFile(new URL("word_graph.json", outputDirectory), text);
console.log(
  `GRAPH_METRICS ${JSON.stringify({
    anchors,
    megabytes: Number((Buffer.byteLength(text) / 1024 / 1024).toFixed(2)),
  })}`,
);
