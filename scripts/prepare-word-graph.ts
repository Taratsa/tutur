// Menambang korpus Leipzig menjadi data graf kata per headword Tutur:
// kata yang muncul dalam kalimat yang sama, tetangga kiri/kanan, pasangan
// kalimat contoh, dan edge antar-node untuk graf.
//
// Rollup morfologis: bentuk inflektif korpus dipetakan ke root headword
// lewat data/indolex/indolex__JSON.json (mis. "dimarahi" -> "marah"),
// sehingga graf mencakup headword yang hanya muncul sebagai turunan.
//
// Input : data/leipzig/<korpus>/*.json untuk tiap korpus di scripts/leipzig-corpora.ts
//         (lihat scripts/fetch-leipzig.ts),
//         data/indolex/indolex__JSON.json, build/data/word-map.json
// Output: build/data/word_graph.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { normalizeWord } from "../shared/src/normalization.ts";
import { LEIPZIG_CORPORA } from "./leipzig-corpora.ts";
import type { PreparedEntry } from "@tutur/shared/types";

const root = new URL("../", import.meta.url);

const MAX_NODES = 14;
const MAX_NEIGHBOURS = 10;
const MAX_SENTENCES = 5;
const MAX_SENTENCE_LENGTH = 200;
const MIN_TOKEN_LENGTH = 2;
const MAX_SURFACES_PER_ANCHOR = 60;
// Bucket per anchor dipangkas ke (batas tampil × ini) setelah tiap korpus.
const BUCKET_HEADROOM = 8;

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

// site.json besar (~200 MB); hanya peta norm -> slug yang dipertahankan.
const [slugByNorm, indolexFile] = await Promise.all([
  readJson<{ entries: PreparedEntry[] }>("build/data/site.json").then(
    (file) => new Map(file.entries.map((entry) => [entry.normalizedWord, entry.slug] as const)),
  ),
  readJson<{ indolex: Array<{ word: string; root: string }> }>(
    "data/indolex/indolex__JSON.json",
  ).catch(() => ({ indolex: [] as Array<{ word: string; root: string }> })),
]);
Bun.gc(true);

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

// Tiap korpus punya ID kata dan kalimat sendiri, jadi dimuat satu per satu
// lalu digabung berdasarkan norm headword. Frekuensi pasangan dijumlahkan;
// signifikansi memakai nilai tertinggi. Berkas ditulis satu baris per data
// (lihat convert-leipzig.ts) dan dibaca bertahap, jadi memori tidak ikut
// membengkak oleh array ratusan MB yang diurai sekaligus.
async function* streamPart<T>(corpus: string, part: string): AsyncGenerator<T> {
  const path = `data/leipzig/${corpus}/leipzig_${part}__JSON.json`;
  const file = Bun.file(new URL(path, root));
  // Gagal-cepat: tanpa korpus, graf kata kosong dan validate-ssr gagal
  // jauh kemudian dengan pesan "word page is missing ... JS-disabled content".
  if (!(await file.exists())) {
    throw new Error(
      `${path} tidak ada — korpus diperlukan untuk membangun graf kata. ` +
        "Jalankan `bun scripts/fetch-leipzig.ts` (unduh ±500 MB per korpus, tidak di-commit).",
    );
  }
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of file.stream()) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      // Lewati pembuka `{"leipzig_x":[` dan penutup `]}`; baris data diakhiri koma.
      if (!line.startsWith('{"') || line.startsWith('{"leipzig_')) continue;
      yield JSON.parse(line.endsWith(",") ? line.slice(0, -1) : line) as T;
    }
  }
}

// Kunci numerik (bukan string) agar jutaan pasangan muat di memori.
const pairKey = (a: number, b: number): number => (a < b ? a * 2 ** 22 + b : b * 2 ** 22 + a);

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

// ID node graf stabil per norm headword, dipakai lintas korpus.
const idByNorm = new Map<string, number>();
const idOf = (norm: string): number => {
  let id = idByNorm.get(norm);
  if (id === undefined) {
    id = idByNorm.size + 1;
    idByNorm.set(norm, id);
  }
  return id;
};

// norm permukaan -> bentuk tampilan terbaik dan total frekuensi lintas korpus.
const surfaces = new Map<string, { word: string; frequency: number; bestFrequency: number }>();
const coByNorm = new Map<string, Map<string, Agg>>();
const leftByNorm = new Map<string, Map<string, Agg>>();
const rightByNorm = new Map<string, Map<string, Agg>>();
const pairWeight = new Map<number, number>();

// Contoh kalimat + hitungan kalimat, diatribusikan ke headword hasil rollup.
// Kandidat disimpan per korpus agar contoh dari semua korpus ikut terpilih.
const sentenceCount = new Map<string, number>();
const sentenceCandidates = new Map<string, string[][]>();
const surfacesPerAnchor = new Map<string, Set<string>>();
let corpusSentenceTotal = 0;

for (const [corpusIndex, corpusId] of LEIPZIG_CORPORA.entries()) {
  // id korpus -> norm permukaan; lalu -> kunci headword (rollup indolex)
  // dan ID numerik node. Dihitung sekali per kata, bukan per pasangan.
  const keyById = new Map<number, { key: string; id: number; anchor: boolean }>();
  const localBest = new Map<string, { word: string; frequency: number }>();
  for await (const word of streamPart<LeipzigWord>(corpusId, "words")) {
    const norm = normalizeWord(word.word);
    if (norm.length < MIN_TOKEN_LENGTH) continue;
    const existing = localBest.get(norm);
    if (!existing || word.frequency > existing.frequency) {
      localBest.set(norm, { word: word.word, frequency: word.frequency });
    }
    const key = resolve(norm) ?? norm;
    if (key.length >= MIN_TOKEN_LENGTH) {
      keyById.set(word.id, { key, id: idOf(key), anchor: slugByNorm.has(key) });
    }
  }
  for (const [norm, best] of localBest) {
    const merged = surfaces.get(norm);
    if (!merged) {
      surfaces.set(norm, { ...best, bestFrequency: best.frequency });
    } else {
      merged.frequency += best.frequency;
      if (best.frequency > merged.bestFrequency) {
        merged.word = best.word;
        merged.bestFrequency = best.frequency;
      }
    }
  }

  // Hanya headword (anchor) yang punya halaman graf, jadi bucket tetangga
  // hanya disimpan untuk anchor; kata lain muncul sebagai node di bucket itu.
  for await (const pair of streamPart<CoPair>(corpusId, "sentence_cooccurrences")) {
    const left = keyById.get(pair.word1_id);
    const right = keyById.get(pair.word2_id);
    if (!left || !right || left.id === right.id) continue;
    const key = pairKey(left.id, right.id);
    pairWeight.set(key, (pairWeight.get(key) ?? 0) + pair.frequency);
    if (left.anchor) pushAgg(bucketOf(coByNorm, left.key), right.key, pair);
    if (right.anchor) pushAgg(bucketOf(coByNorm, right.key), left.key, pair);
  }

  for await (const pair of streamPart<CoPair>(corpusId, "neighbour_cooccurrences")) {
    const left = keyById.get(pair.word1_id);
    const right = keyById.get(pair.word2_id);
    if (!left || !right || left.id === right.id) continue;
    // word1 berada di kiri word2 (format sumber kiri-ke-kanan).
    if (left.anchor) pushAgg(bucketOf(rightByNorm, left.key), right.key, pair);
    if (right.anchor) pushAgg(bucketOf(leftByNorm, right.key), left.key, pair);
  }

  for await (const sentence of streamPart<{ id: number; text: string }>(corpusId, "sentences")) {
    corpusSentenceTotal += 1;
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
        let perCorpus = sentenceCandidates.get(anchor);
        if (!perCorpus) {
          perCorpus = [];
          sentenceCandidates.set(anchor, perCorpus);
        }
        const list = (perCorpus[corpusIndex] ??= []);
        if (list.length < MAX_SENTENCES * 4) list.push(sentence.text);
      }
    }
  }

  // Pangkas bucket ke kandidat teratas per anchor sebelum korpus berikutnya:
  // halaman hanya memakai MAX_NODES / MAX_NEIGHBOURS teratas, dan ekor panjang
  // pasangan langka-lah yang membuat memori membengkak saat dua korpus digabung.
  for (const [map, limit] of [
    [coByNorm, MAX_NODES * BUCKET_HEADROOM],
    [leftByNorm, MAX_NEIGHBOURS * BUCKET_HEADROOM],
    [rightByNorm, MAX_NEIGHBOURS * BUCKET_HEADROOM],
  ] as const) {
    for (const [anchor, bucket] of map) {
      if (bucket.size <= limit) continue;
      const kept = [...bucket.values()]
        .sort((a, b) => b.significance - a.significance || b.frequency - a.frequency)
        .slice(0, limit);
      map.set(anchor, new Map(kept.map((entry) => [entry.other, entry] as const)));
    }
  }
}

const corpusSentences = (norm: string, groupSurfaces: Iterable<string>): string[] => {
  const patternText = [...new Set(groupSurfaces)]
    .map((surface) => surface.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|");
  const pattern = patternText ? new RegExp(`\\b(${patternText})\\b`, "giu") : null;
  const lists = (sentenceCandidates.get(norm) ?? []).filter(Boolean);
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const unique = new Set<string>();
  const output: string[] = [];
  // Selang-seling antar korpus supaya contoh tidak hanya dari korpus pertama.
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const text = list[index];
      if (text === undefined) continue;
      const marked = pattern ? text.replace(pattern, (match) => `«${match}»`) : text;
      if (marked === text || unique.has(marked)) continue;
      unique.add(marked);
      output.push(marked);
      if (output.length >= MAX_SENTENCES) return output;
    }
  }
  return output;
};

const graphNode = (norm: string, sig: number, freq: number): GraphNode | null => {
  if (norm.length < MIN_TOKEN_LENGTH) return null;
  const surface = surfaces.get(norm);
  return {
    word: surface?.word ?? norm,
    id: idOf(norm),
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
  const anchorId = idOf(norm);

  const nodes: GraphNode[] = [...bucket.values()]
    .filter((entry) => entry.other !== norm)
    .sort(
      (left, right) => right.significance - left.significance || right.frequency - left.frequency,
    )
    .slice(0, MAX_NODES)
    .map((entry) => graphNode(entry.other, entry.significance, entry.frequency))
    .filter((node): node is GraphNode => node !== null);

  const chosen = [
    { id: anchorId, norm },
    ...nodes.map((node) => ({ id: node.id, norm: node.norm })),
  ];
  const edges: [number, number, number][] = [];
  for (let i = 0; i < chosen.length; i += 1) {
    for (let j = i + 1; j < chosen.length; j += 1) {
      const frequency = pairWeight.get(pairKey(chosen[i]!.id, chosen[j]!.id));
      if (frequency) edges.push([chosen[i]!.id, chosen[j]!.id, frequency]);
    }
  }
  edges.sort((left, right) => right[2] - left[2]);

  const neighboursFor = (side: "left" | "right"): GraphNode[] =>
    [...((side === "left" ? leftByNorm : rightByNorm).get(norm)?.values() ?? [])]
      .filter((entry) => entry.other !== norm)
      .sort(
        (left, right) => right.significance - left.significance || right.frequency - left.frequency,
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

const output = {
  corpora: [...LEIPZIG_CORPORA],
  corpusSentences: corpusSentenceTotal,
  anchors: Object.keys(graphs).length,
  graphs,
};
const outputDirectory = new URL("build/data/", root);
await mkdir(outputDirectory, { recursive: true });
const text = JSON.stringify(output);
await writeFile(new URL("word_graph.json", outputDirectory), text);
console.log(
  `GRAPH_METRICS ${JSON.stringify({
    anchors: output.anchors,
    nodes: graphStats.nodes,
    edges: graphStats.edges,
    examples: graphStats.examples,
    megabytes: Number((Buffer.byteLength(text) / 1024 / 1024).toFixed(2)),
  })}`,
);
