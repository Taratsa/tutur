# KBBI Data Explorer

KBBI Data Explorer adalah situs kamus Bahasa Indonesia yang dibangun dari
dataset referensi KBBI SQL Database. Situs ini bukan layanan resmi KBBI dan
tidak berafiliasi dengan Badan Pengembangan dan Pembinaan Bahasa.

Repositori ini sengaja memakai Git baru. Isi `edisi-IV/`, `baku-nonbaku/`,
`sinonim/`, dan `antonim/` diperlakukan sebagai data source/reference untuk
membangun keluaran baru; riwayat Git repositori sumber tidak digunakan.

## Arsitektur

```text
source JSON
    │
    ├── shared/       normalisasi, slug, sanitasi, sitemap
    ├── Astro SSR     halaman HTML saat request dari SQLite read-only
    └── Bun + Hono    API pencarian → SQLite read-only + FTS5
```

- `ui/` adalah situs Astro SSR dengan adapter Node yang dijalankan melalui Bun
  di VPS. `@astrojs/svelte` hanya dipakai untuk island pencarian di `/search/`.
- `api/` adalah layanan Bun/Hono yang dapat dijalankan terpisah di VPS. SQLite
  dibuat deterministik dari JSON saat build dan dibuka read-only saat runtime.
- `shared/` mencegah build Astro dan API menghasilkan normalisasi atau slug
  yang berbeda.
- Halaman `/kata/[slug]/` mengambil satu entri dari SQLite dan mengirim judul,
  canonical, heading, semua definisi, relasi yang valid, dan disclaimer dalam
  HTML awal. JavaScript tidak diperlukan untuk membaca definisi.

SSR dipilih karena origin deployment adalah VPS di belakang Cloudflare. Cache
edge dapat menyimpan HTML kata selama tujuh hari, sementara origin hanya perlu
menyimpan satu database SQLite dan tidak perlu menyebarkan 71 ribu file. API
tetap independen sehingga pencarian tidak mengirim indeks kamus lengkap ke
browser. Jika UI dipindah ke platform statis seperti GitHub Pages, halaman
kata SSR tidak dapat berjalan tanpa migrasi kembali ke SSG atau menambahkan
runtime serverless.

## Local development

Memerlukan Bun 1.3.14 atau yang kompatibel.

```bash
bun install
bun run dev
```

Perintah tersebut menyiapkan database sekali, lalu menjalankan Astro SSR pada
`http://localhost:43921` dan API pada `http://localhost:3001`. Gunakan
`UI_PORT` dan `API_PORT` untuk mengubah keduanya. Salin `.env.example` bila
ingin mengubah URL situs atau endpoint pencarian. Tidak diperlukan credential
produksi.

Perintah penting:

```bash
bun run data:prepare       # normalisasi source JSON → build/data
bun run api:build          # buat api/data/search.sqlite
bun run ui:build           # build dan validasi UI saja
bun run build              # build data, SQLite, Astro, dan output checks
bun test shared/test api/test ui/test
bun run lint
bun run format:check
bun run ui:check
```

`build/`, `ui/dist/`, dan `api/data/search.sqlite` adalah artefak generated dan
diabaikan Git. Jangan commit `node_modules` atau output build.

## Data dan normalisasi

`bun run data:prepare` membaca JSON referensi, mengelompokkan seluruh record
kamus berdasarkan normalized headword, lalu membuat satu entri canonical per
kata. Definisi yang berulang tetap digabung pada halaman kata yang sama.

Normalisasi menggunakan Unicode NFKC, trim, penggabungan whitespace berulang,
dan lower-case `id-ID`. Slug memakai bentuk readable yang collision-safe; bila
dua kata berbeda menghasilkan slug sama, suffix stabil seperti `-2` dan `-3`
ditambahkan. Build gagal apabila rute tidak unik atau definisi kosong.

Definisi disanitasi dengan allowlist HTML kecil (`b`, `strong`, `i`, `em`,
`sup`, `sub`, dan `br`). Atribut dan tag lain dibuang atau di-escape sebelum
dirender oleh Astro.

## Rendering dan URL

| URL                       | Rendering                                                 | Indexing           |
| ------------------------- | --------------------------------------------------------- | ------------------ |
| `/`                       | Astro SSG                                                 | indexable          |
| `/kata/[slug]/`           | Astro SSR dari SQLite, satu route per normalized headword | indexable          |
| `/huruf/[letter]/[page]/` | Astro SSR, 250 kata per halaman                           | indexable          |
| `/search/`                | Astro static + Svelte island                              | `noindex,follow`   |
| `/developer/`, `/about/`  | Astro SSG                                                 | indexable          |
| `/api/search`             | Bun/Hono JSON                                             | bukan halaman HTML |

URL huruf halaman pertama tidak memiliki duplikat `/1/`: `/huruf/a/` adalah
halaman pertama dan `/huruf/a/2/` halaman berikutnya. Semua daftar memakai
`<a href>` biasa, sehingga navigasi tetap berfungsi dengan JavaScript mati.

## API pencarian

Endpoint publik:

```text
GET /health
GET /api/search?q=bahasa&type=all&limit=20
```

`type` dapat berupa `all`, `dictionary`, `baku`, `sinonim`, atau `antonim`.
Query dinormalisasi, minimal dua karakter, maksimal 80 karakter, dan limit
dibatasi 1–50. Hasil mengandung URL canonical seperti `/kata/bahasa/`.

SQLite memodelkan entries, definitions, dan tiga tabel relasi secara terpisah.
Lookup exact/prefix memakai indeks biasa; FTS5 dipakai untuk pencarian token dan
substring. Ranking memprioritaskan exact, prefix, whole-token, lalu FTS.

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

`api/Dockerfile` adalah contoh image minimal. Build context harus root
repositori dan artefak `api/data/search.sqlite` harus dibuat atau disediakan
sebelum `docker build`; database runtime sebaiknya dipasang sebagai artefak
read-only dan dibackup saat dataset diperbarui. Pembuatan database menulis file
sementara lalu menggantinya secara atomik setelah selesai.

## Sitemap dan deployment

Astro membuat:

- `robots.txt`;
- `sitemap-index.xml`;
- sitemap static dan alphabet;
- beberapa `sitemap-words/*.xml`, masing-masing paling banyak 50.000 URL.

`SITE_URL` wajib diisi dan divalidasi untuk deployment. Set repository variables
`SITE_URL`, `BASE_PATH` (opsional, default `/`), dan `SEARCH_API_URL` sebelum
workflow berjalan karena island pencarian tidak boleh
menebak host produksi.

Di VPS, jalankan bundle SSR dan API sebagai proses terpisah, dengan database
SQLite dipasang read-only:

```bash
UI_DATABASE_PATH=../api/data/search.sqlite PORT=4321 bun run --cwd ui start
PORT=3001 SEARCH_DB_PATH=./data/search.sqlite bun run --cwd api start
```

Origin mengirim cache bersama tujuh hari untuk `/kata/*` dan satu hari untuk
`/huruf/*`; reverse proxy atau Cloudflare harus mengaktifkan cache HTML publik.
Setelah mengganti database, purge URL kata atau prefix `/kata/` agar cache lama
tidak menunggu TTL.

Workflow `.github/workflows/deploy-pages.yml` dipertahankan sebagai CI/release
build: workflow melakukan checkout, memasang Bun dengan lockfile, menjalankan
lint/format/test/type check, membuat database dan SSR bundle, menjalankan
output validation, lalu mengunggah artefak release. Workflow itu tidak lagi
mendeploy ke GitHub Pages karena Pages hanya menyajikan file statis; jalankan
`ui/dist/server/entry.mjs` di VPS di belakang reverse proxy atau Cloudflare.

## Ukuran keluaran dan validasi

`bun run build` mencetak metrik data, database, output, dan durasi; nilainya
dihitung dari source JSON saat build, bukan di-hard-code.

```text
DATA_METRICS       printed during data preparation
DB_METRICS         printed during SQLite generation
OUTPUT_METRICS     printed during output validation
BUILD_DURATION_MS  printed after the complete build
```

Snapshot pengukuran dataset saat ini: 115.978 record menghasilkan 71.093
headword unik, 44.885 record duplikat, dan 63 collision slug. Build penuh
terakhir selesai dalam 13,16 detik; output Astro sekitar 1,55 MiB dan jumlah
gzip per-file sekitar 0,44 MiB. Database SQLite sekitar 243.159.040 byte.
Arsip `ui/dist` sebagai tar.gz berukuran sekitar 452.141 byte.
Halaman kata contoh berukuran 31.427 byte dan memiliki nol module script.
Bundle SearchIsland berukuran 109.016 byte (30.892 byte gzip), sedangkan CSS
bersama 31.083 byte (6.515 byte gzip). Sitemap menghasilkan 4 dokumen dengan
71.392 URL.

Validator memeriksa jumlah halaman kata, collision/duplicate route, title,
canonical, `h1`, definisi, hydration pada halaman kata, sitemap limits, link
sitemap, ukuran output, ukuran HTML, serta ukuran bundle JavaScript/CSS. Batas
gagal utama adalah route hilang/duplikat, definisi kosong, sitemap melebihi
limit protokol, output di atas 700 MB, atau runtime hydration pada halaman kata.

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
Kementerian Pendidikan Dasar dan Menengah Republik Indonesia**. Explorer ini
tidak resmi; verifikasi ke sumber resmi sebelum penggunaan penting atau
komersial. Ketentuan hak cipta dan lisensi sumber tetap berlaku.

## Direktori data lama

Dokumentasi dan contoh konsumsi data sumber tetap tersedia di:

- [`edisi-IV/`](edisi-IV/)
- [`baku-nonbaku/`](baku-nonbaku/)
- [`sinonim/`](sinonim/)
- [`antonim/`](antonim/)
- [`data-raw/`](data-raw/)
