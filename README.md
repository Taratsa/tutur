# KBBI Search API

Repositori ini membangun database pencarian kamus Bahasa Indonesia dari dataset
referensi KBBI SQL Database dan menyediakan API pencarian Bun/Hono di atas
SQLite read-only. Proyek ini bukan layanan resmi KBBI dan tidak berafiliasi
dengan Badan Pengembangan dan Pembinaan Bahasa.

Repositori ini sengaja memakai Git baru. Isi `edisi-IV/`, `baku-nonbaku/`,
`sinonim/`, dan `antonim/` diperlakukan sebagai data source/reference untuk
membangun keluaran baru; riwayat Git repositori sumber tidak digunakan.

## Arsitektur

```text
source JSON
    │
    ├── scripts/      pipeline data: normalisasi source JSON → build/data
    ├── shared/       normalisasi, slug, sanitasi (dipakai pipeline & API)
    └── api/          Bun + Hono → SQLite read-only + FTS5
```

- `scripts/prepare-data.mjs` membaca JSON referensi dan menulis
  `build/data/site.json`.
- `api/scripts/build-db.mjs` mengubah `build/data/site.json` menjadi
  `api/data/search.sqlite` secara deterministik. Database dibuat sekali saat
  build dan dibuka read-only saat runtime.
- `shared/` mencegah pipeline data dan API menghasilkan normalisasi atau slug
  yang berbeda.

## Local development

Memerlukan Bun 1.3.14 atau yang kompatibel.

```bash
bun install
bun run dev
```

Perintah tersebut menyiapkan database sekali, lalu menjalankan API pada
`http://localhost:3001`. Gunakan `API_PORT` untuk mengubah port. Tidak
diperlukan credential produksi.

Perintah penting:

```bash
bun run data:prepare       # normalisasi source JSON → build/data
bun run api:build          # buat api/data/search.sqlite
bun run build              # build data dan SQLite lengkap
bun test shared/test api/test
bun run lint
bun run format:check
```

`build/` dan `api/data/search.sqlite` adalah artefak generated dan diabaikan
Git. Jangan commit `node_modules` atau output build.

## Data dan normalisasi

`bun run data:prepare` membaca JSON referensi, mengelompokkan seluruh record
kamus berdasarkan normalized headword, lalu membuat satu entri canonical per
kata. Definisi yang berulang tetap digabung pada entri yang sama.

Normalisasi menggunakan Unicode NFKC, trim, penggabungan whitespace berulang,
dan lower-case `id-ID`. Slug memakai bentuk readable yang collision-safe; bila
dua kata berbeda menghasilkan slug sama, suffix stabil seperti `-2` dan `-3`
ditambahkan. Build gagal apabila rute tidak unik atau definisi kosong.

Definisi disanitasi dengan allowlist HTML kecil (`b`, `strong`, `i`, `em`,
`sup`, `sub`, dan `br`). Atribut dan tag lain dibuang atau di-escape sebelum
disimpan ke database.

## API pencarian

Endpoint publik:

```text
GET /health
GET /api/search?q=bahasa&type=all&limit=20
```

`type` dapat berupa `all`, `dictionary`, `baku`, `sinonim`, atau `antonim`.
Query dinormalisasi, minimal dua karakter, maksimal 80 karakter, dan limit
dibatasi 1–50. Hasil mengandung `slug` dan URL canonical seperti
`/kata/bahasa/` yang dapat dipakai konsumen untuk membangun tautan halaman
kata.

SQLite memodelkan entries, definitions, dan tiga tabel relasi secara terpisah.
Lookup exact/prefix memakai indeks biasa; FTS5 dipakai untuk pencarian token
dan substring. Ranking memprioritaskan exact, prefix, whole-token, lalu FTS.

Build database:

```bash
bun run api:build
SEARCH_DB_PATH=data/search.sqlite bun run --cwd api start
curl http://localhost:3001/health
```

`api/.env.example` berisi `PORT`, `SEARCH_DB_PATH`, `CORS_ORIGIN`, dan batas
rate. Atur `CORS_ORIGIN` secara eksplisit di produksi; jangan membuka semua
origin tanpa alasan. Rate limiter bawaan bersifat process-local, sehingga
deployment multi-instance atau trafik besar memerlukan rate limiting di
reverse proxy/Cloudflare dan observability yang sesuai.

## Deployment

`Dockerfile` multi-tahap membangun database di dalam gambar; tahap runtime
hanya berisi `oven/bun:1-alpine`, sumber API, `hono`, `@tutur/shared`, dan
`search.sqlite` — tanpa devDependencies dan tanpa build tooling, berjalan
sebagai user non-root.

```bash
docker build -t tutur .

# API pencarian di 3001
docker run -p 3001:3001 tutur
```

`compose.yml` menjalankan API dari satu gambar, dengan healthcheck `/health`:

```bash
docker compose up --build
```

Database disalin ke dalam gambar dan hanya dibuka read-only. Untuk mengganti
database tanpa rebuild, mount file yang baru:

```bash
docker run -p 3001:3001 \
  -v "$PWD/api/data/search.sqlite:/app/api/data/search.sqlite:ro" tutur
```

`.dockerignore` membatasi build context hanya pada sumber JSON tiap dataset
(sekitar 45 MB); format ekspor lama, `data-raw/`, dan `node_modules` tidak
dikirim ke daemon.

Di VPS tanpa Docker, jalankan API sebagai proses tunggal dengan database
SQLite dipasang read-only:

```bash
bun install --frozen-lockfile
bun run build
PORT=3001 SEARCH_DB_PATH=./data/search.sqlite bun run --cwd api start
```

Workflow `.github/workflows/ci.yml` menjalankan lint, format check, test,
build data dan database, lalu mengunggah `api/data/search.sqlite` sebagai
artefak release.

## Ukuran keluaran

`bun run build` mencetak metrik data, database, dan durasi; nilainya dihitung
dari source JSON saat build, bukan di-hard-code.

```text
DATA_METRICS       printed during data preparation
DB_METRICS         printed during SQLite generation
BUILD_DURATION_MS  printed after the complete build
```

Snapshot pengukuran dataset saat ini: 115.978 record menghasilkan 71.093
headword unik, 44.885 record duplikat, dan 63 collision slug. Build penuh
terakhir selesai dalam 14,35 detik. Database SQLite sekitar 243.159.040 byte.

## Data ownership dan disclaimer

Data di direktori source merupakan kurasi dari beberapa sumber publik dan
sebagian data relasi dibuat dengan bantuan AI. Sumber referensi yang disimpan
di repositori ini antara lain:

1. [Ican Bachors — KBBI.sql](https://github.com/bachors/KBBI.sql)
2. [aryakdaniswara — kbbi-v6-full-csv](https://github.com/aryakdaniswara/kbbi-v6-full-csv)
3. [aryakdaniswara — kbbi-v6-categories](https://github.com/aryakdaniswara/kbbi-v6-categories)
4. [aryakdaniswara — kbbi-v6-wordlist](https://github.com/aryakdaniswara/kbbi-v6-wordlist)
5. [aryakdaniswara — kbbi-dataset-kbbi-v](https://github.com/aryakdaniswara/kbbi-dataset-kbbi-v)
6. [raf555 — KBBI-api](https://github.com/raf555/kbbi-api)
7. Baku/nonbaku, sinonim, dan antonim pada direktori masing-masing.

Kepemilikan data kamus berada pada **Badan Pengembangan dan Pembinaan Bahasa,
Kementerian Pendidikan Dasar dan Menengah Republik Indonesia**. Proyek ini
tidak resmi; verifikasi ke sumber resmi sebelum penggunaan penting atau
komersial. Ketentuan hak cipta dan lisensi sumber tetap berlaku.

## Direktori data lama

Dokumentasi dan contoh konsumsi data sumber tetap tersedia di:

- [`edisi-IV/`](edisi-IV/)
- [`baku-nonbaku/`](baku-nonbaku/)
- [`sinonim/`](sinonim/)
- [`antonim/`](antonim/)
- [`data-raw/`](data-raw/)
