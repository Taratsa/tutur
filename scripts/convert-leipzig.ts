// Konversi arsip korpus Leipzig (format sumber .txt) ke format kanonis JSON
// yang dipakai pipeline Tutur (data/leipzig/*.json).
//
// Pakai: bun scripts/convert-leipzig.ts <dir-ekstrak> <corpus-id> [arsip.tar.gz]
// Contoh: bun scripts/convert-leipzig.ts /tmp/leipzig-1M ind_mixed_2013_1M /tmp/ind_mixed_2013_1M.tar.gz
//
// Berkas sumber yang dibaca (format standar Leipzig Corpora Collection):
//   <corpus>-words.txt      : word_id \t word [\t frequency]
//   <corpus>-sentences.txt  : sentence_id \t text
//   <corpus>-co_s.txt       : word1_id \t word2_id \t freq \t sig
//   <corpus>-co_n.txt       : word1_id \t word2_id \t freq \t sig
//
// word_sentence_index sengaja tidak dibuat: berkasnya ratusan MB pada korpus
// besar dan tidak dipakai pipeline (prepare-word-graph.ts memindai kalimat
// langsung lewat data/leipzig/leipzig_sentences__JSON.json).
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sourceDir = process.argv[2];
const corpusId = process.argv[3];
const archiveArg = process.argv[4];
if (!sourceDir || !corpusId) {
  console.error("pakai: bun scripts/convert-leipzig.ts <dir-ekstrak> <corpus-id> [arsip.tar.gz]");
  process.exit(1);
}

const outDir = join(process.cwd(), "data", "leipzig");
await mkdir(outDir, { recursive: true });

function lines(name) {
  const text = readFileSync(join(sourceDir, `${corpusId}-${name}.txt`), "utf8");
  return text.split("\n");
}

async function writeJsonStream(fileName, rootKey, rows, format) {
  const sink = Bun.file(join(outDir, `leipzig_${fileName}__JSON.json`)).writer();
  await sink.write(`{"${rootKey}":[`);
  let first = true;
  let count = 0;
  for (const row of rows) {
    if (!first) await sink.write(",");
    first = false;
    await sink.write(format(row));
    count += 1;
  }
  await sink.write("]}\n");
  await sink.end();
  console.log(`${rootKey}: ${count}`);
}

// --- words: id -> word (+ frekuensi dari kolom 3 bila tersedia) ---------------
const wordById = new Map();
const wordFrequency = new Map();
for (const line of lines("words")) {
  if (!line) continue;
  const parts = line.split("\t");
  const id = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isInteger(id) || !parts[1]) continue;
  wordById.set(id, parts[1]);
  const frequency = Number.parseInt(parts[2] ?? "", 10);
  if (Number.isInteger(frequency)) wordFrequency.set(id, frequency);
}
console.log("word types:", wordById.size);

// --- sentences: id -> text ------------------------------------------------------
const sentenceRows = [];
for (const line of lines("sentences")) {
  if (!line) continue;
  const parts = line.split("\t");
  const id = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isInteger(id)) continue;
  sentenceRows.push({ id, text: parts.slice(1).join("\t").trim() });
}
console.log("sentences:", sentenceRows.length);

// --- words rows ----------------------------------------------------------------
const wordRows = [];
for (const [id, word] of wordById) {
  const frequency = wordFrequency.get(id) ?? 0;
  wordRows.push({ id, word, frequency });
}

// --- pasangan co_s / co_n -------------------------------------------------------
function* pairRows(name) {
  for (const line of lines(name)) {
    if (!line) continue;
    const parts = line.split("\t");
    const word1 = Number.parseInt(parts[0] ?? "", 10);
    const word2 = Number.parseInt(parts[1] ?? "", 10);
    const frequency = Number.parseInt(parts[2] ?? "", 10);
    const significance = Number.parseFloat(parts[3] ?? "");
    if (!Number.isInteger(word1) || !Number.isInteger(word2) || !Number.isInteger(frequency)) {
      continue;
    }
    yield { word1_id: word1, word2_id: word2, frequency, significance };
  }
}

await writeJsonStream(
  "sentence_cooccurrences",
  "leipzig_sentence_cooccurrences",
  pairRows("co_s"),
  (row) => JSON.stringify(row),
);
await writeJsonStream(
  "neighbour_cooccurrences",
  "leipzig_neighbour_cooccurrences",
  pairRows("co_n"),
  (row) => JSON.stringify(row),
);
await writeJsonStream("words", "leipzig_words", wordRows, (row) => {
  const frequency = wordFrequency.get(row.id) ?? 0;
  return `{"id":${row.id},"word":${JSON.stringify(row.word)},"frequency":${frequency}}`;
});
await writeJsonStream("sentences", "leipzig_sentences", sentenceRows, (row) => JSON.stringify(row));

// --- metadata ---------------------------------------------------------------------
const archivePath = archiveArg ?? join(sourceDir, "..", `${corpusId}.tar.gz`);
let archiveBytes = null;
try {
  archiveBytes = Bun.file(archivePath).size;
} catch {
  archiveBytes = null;
}
const metadata = {
  leipzig_metadata: {
    corpus_id: corpusId.replace(/^ind_mixed_\d+[KM]$/u, "ind_mixed_2013"),
    archive: `${corpusId}.tar.gz`,
    archive_url: `https://downloads.wortschatz-leipzig.de/corpora/${corpusId}.tar.gz`,
    archive_bytes: archiveBytes,
    build_date: new Date().toISOString().slice(0, 10),
    word_types: wordById.size,
    sentences: sentenceRows.length,
    sources: null,
    retained: {
      words: wordRows.length,
      sentences: sentenceRows.length,
      neighbour_cooccurrences: 0,
      sentence_cooccurrences: 0,
    },
    omitted: [
      "sources",
      "sentence_source_index",
      "import_sql",
      "word_positions",
      "word_sentence_index",
    ],
  },
};
await writeFile(join(outDir, "leipzig_metadata__JSON.json"), `${JSON.stringify(metadata)}\n`);
console.log("metadata written");
