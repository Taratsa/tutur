// Unduh, ekstrak, dan konversi korpus Leipzig untuk Tutur.
// Pakai: bun scripts/fetch-leipzig.ts [cut]
//   cut: "100K" (default) atau "1M"
// Korpus 1M besarnya ratusan MB; JSON hasil konversi (~500 MB) tidak
// di-commit — jalankan skrip ini sekali di mesin yang akan membangun proyek.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const cut = (process.argv[2] ?? "1M").toUpperCase();
if (!["100K", "1M"].includes(cut)) {
  console.error("cut harus 100K atau 1M");
  process.exit(1);
}
const corpusId = `ind_mixed_2013_${cut}`;
const archivePath = `/tmp/${corpusId}.tar.gz`;
const extractDir = `/tmp/leipzig-${cut}`;
const url = `https://downloads.wortschatz-leipzig.de/corpora/${corpusId}.tar.gz`;

console.log(`mengunduh ${url}`);
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const proc = Bun.spawnSync(["curl", "-sL", "-C", "-", "--retry", "2", "-o", archivePath, url]);
  if (proc.exitCode === 0) break;
  console.log(`unduhan gagal (percobaan ${attempt}), melanjutkan...`);
}
const archive = Bun.file(archivePath);
if (!archive.size) throw new Error("arsip tidak terunduh");

console.log(`mengekstrak ${archivePath}`);
await rm(extractDir, { recursive: true, force: true });
await mkdir(extractDir, { recursive: true });
const tar = Bun.spawnSync(["tar", "-xzf", archivePath, "-C", extractDir]);
if (tar.exitCode !== 0) throw new Error("ekstraksi gagal");

console.log("mengonversi ke JSON kanonis");
const convert = Bun.spawnSync(
  ["bun", join(import.meta.dir, "convert-leipzig.ts"), extractDir, corpusId, archivePath],
  { stdout: "inherit", stderr: "inherit" },
);
if (convert.exitCode !== 0) process.exit(convert.exitCode ?? 1);
console.log(`selesai: data/leipzig berisi snapshot ${corpusId}`);
