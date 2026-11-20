// Unduh, ekstrak, dan konversi korpus Leipzig untuk Tutur.
// Pakai: bun scripts/fetch-leipzig.ts [cut] [korpus...]
//   cut   : "100K" atau "1M" (default)
//   korpus: subset dari scripts/leipzig-corpora.ts (default: semuanya)
// Tiap korpus 1M besarnya ratusan MB; JSON hasil konversi (~450 MB per
// korpus) tidak di-commit — jalankan skrip ini sekali di mesin yang akan
// membangun proyek.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { LEIPZIG_CORPORA, LEIPZIG_DOWNLOAD_BASE } from "./leipzig-corpora.ts";

const cut = (process.argv[2] ?? "1M").toUpperCase();
if (!["100K", "1M"].includes(cut)) {
  console.error("cut harus 100K atau 1M");
  process.exit(1);
}
const requested = process.argv.slice(3);
const unknown = requested.filter((id) => !(LEIPZIG_CORPORA as readonly string[]).includes(id));
if (unknown.length > 0) {
  console.error(
    `korpus tidak dikenal: ${unknown.join(", ")} (pilihan: ${LEIPZIG_CORPORA.join(", ")})`,
  );
  process.exit(1);
}
const targets = requested.length > 0 ? requested : [...LEIPZIG_CORPORA];

for (const base of targets) {
  const corpusId = `${base}_${cut}`;
  const archivePath = `/tmp/${corpusId}.tar.gz`;
  // Arsip Leipzig membungkus berkasnya dalam satu direktori bernama corpus-id,
  // jadi berkas yang dibaca convert-leipzig.ts berada di <extractRoot>/<corpusId>/.
  const extractRoot = `/tmp/leipzig-${corpusId}`;
  const extractDir = join(extractRoot, corpusId);
  const url = `${LEIPZIG_DOWNLOAD_BASE}/${corpusId}.tar.gz`;

  console.log(`mengunduh ${url}`);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const proc = Bun.spawnSync(["curl", "-sL", "-C", "-", "--retry", "2", "-o", archivePath, url]);
    if (proc.exitCode === 0) break;
    console.log(`unduhan gagal (percobaan ${attempt}), melanjutkan...`);
  }
  const archive = Bun.file(archivePath);
  if (!archive.size) throw new Error(`arsip ${corpusId} tidak terunduh`);

  console.log(`mengekstrak ${archivePath}`);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  const tar = Bun.spawnSync(["tar", "-xzf", archivePath, "-C", extractRoot]);
  if (tar.exitCode !== 0) throw new Error(`ekstraksi ${corpusId} gagal`);

  console.log("mengonversi ke JSON kanonis");
  const convert = Bun.spawnSync(
    ["bun", join(import.meta.dir, "convert-leipzig.ts"), extractDir, corpusId, archivePath],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (convert.exitCode !== 0) process.exit(convert.exitCode ?? 1);
  await rm(extractRoot, { recursive: true, force: true });
  console.log(`selesai: data/leipzig/${base} berisi snapshot ${corpusId}`);
}
