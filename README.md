# Tutur

Tutur adalah situs kamus Bahasa Indonesia yang dibangun dari
dataset referensi KBBI SQL Database. Situs ini bukan layanan resmi KBBI dan
tidak berafiliasi dengan Badan Pengembangan dan Pembinaan Bahasa.

Repositori ini sengaja memakai Git baru. Isi `data/edisi-IV/`, `data/baku-nonbaku/`,
`data/sinonim/`, `data/antonim/`, `data/indolex/`, `data/kamus-alay/`, dan
`data/kbbi-v6/` diperlakukan
sebagai data source/reference untuk membangun keluaran baru; riwayat Git
repositori sumber tidak digunakan.

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
  canonical, heading, semua definisi, relasi yang valid, frekuensi korpus,
  akar dan keluarga kata, turunan/gabungan kata, peribahasa, bentuk slang,
  dan disclaimer dalam HTML awal. JavaScript tidak diperlukan untuk membaca
  definisi.

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
bun run validate:a11y      # audit aksesibilitas axe-core (perlu build dulu)
bun test shared/test api/test ui/test
bun run lint
bun run format:check
bun run ui:check
```

`bun run build` dan `bun run validate:a11y` menjalankan audit axe-core di
headless Chromium, jadi jalankan sekali `bunx playwright install chromium`
sebelum pertama kali memakainya.

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

### Enrichment: frekuensi, akar kata, slang, dan KBBI VI

Selain empat dataset relasi, `bun run data:prepare` menggabungkan tiga sumber
baru ke dalam data canonical:

- **IndoLeX** (`data/indolex/`): tabel `kbbi_edisi_iv_enrichment` join-ready
  memberi setiap headword `frequency` (korpus 110+ juta kata), `root`,
  `root_rank`, dan `root_frequency`; 38.364 dari 71.093 headword terenrich.
  File `indolex__JSON.json` menyediakan 131.534 bentuk kata yang dikelompokkan
  menjadi 17.367 keluarga kata per akar untuk halaman kata. Frekuensi juga
  dipakai sebagai tiebreaker ranking pencarian dan untuk halaman `/populer/`.
- **Kamus Alay** (`data/kamus-alay/`): 4.459 pasangan slang → bentuk baku menjadi
  koleksi `slang` di API (`type=slang`) dan bagian "Bentuk slang" di halaman
  kata baku yang memilikinya.
- **KBBI VI** (`data/kbbi-v6/`, snapshot Definisi/kbbi): contoh pemakaian,
  turunan, gabungan kata, peribahasa, kiasan, pelafalan, dan etimologi
  di-join per normalized headword (bukan menggabungkan makna lintas edisi)
  dan disimpan di tabel `entry_extras`; 68.245 headword terenrich. Halaman
  kata menampilkan bagian ini hanya bila datanya ada.

Nilai v6 dan slang dirender sebagai teks polos hasil trim/pemadatan
whitespace; tidak ada HTML mentah dari sumber yang lolos ke halaman.

## Rendering dan URL

| URL                       | Rendering                                                 | Indexing           |
| ------------------------- | --------------------------------------------------------- | ------------------ |
| `/`                       | Astro SSG                                                 | indexable          |
| `/kata/[slug]/`           | Astro SSR dari SQLite, satu route per normalized headword | indexable          |
| `/huruf/[letter]/[page]/` | Astro SSR, 250 kata per halaman                           | indexable          |
| `/populer/`               | Astro SSG, 100 kata berfrekuensi tertinggi                | indexable          |
| `/search/`                | Astro static + Svelte island                              | `noindex,follow`   |
| `/sumber/`, `/about/`     | Astro SSG                                                 | indexable          |
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

`type` dapat berupa `all`, `dictionary`, `baku`, `sinonim`, `antonim`, atau
`slang`. Query dinormalisasi, minimal dua karakter, maksimal 80 karakter, dan
limit dibatasi 1–50. Hasil mengandung URL canonical seperti `/kata/bahasa/`.

SQLite memodelkan entries, definitions, tabel relasi (baku, sinonim, antonim,
slang), `word_families`, dan `entry_extras` secara terpisah. Lookup exact/prefix
memakai indeks biasa; FTS5 dipakai untuk pencarian token dan substring. Ranking
memprioritaskan exact, prefix, whole-token, lalu FTS; kandidat dengan rank sama
diuraskan berdasarkan frekuensi korpus IndoLeX sebagai tiebreaker. Query slang
seperti `bgt` mengembalikan entri koleksi `slang` yang menunjuk ke URL bentuk
bakunya.

Build database:

```bash
bun run api:build
SEARCH_DB_PATH=data/search.sqlite bun run --cwd api start
curl http://localhost:3001/health
```

### Performa

Hasil uji beban (mixed traffic, 250 klien) setelah optimasi: 649 RPS dengan
p99 711 ms; exact match 1.007 RPS dengan p99 317 ms; worst case awal
(pencarian trigram 3 karakter, 20 detik) turun menjadi ratusan milidetik.

- Pipeline pencarian berhenti lebih awal: fase exact → prefix → token FTS
  dijalankan berurutan, dan begitu jumlah hasil mencapai limit, fase
  berikutnya dilewati karena tidak mungkin masuk hasil akhir.
- Query 2-3 karakter memakai pemindaian LIKE yang berbatas, bukan trigram
  FTS (hasilnya diurutkan berdasarkan frekuensi korpus, bukan relevansi).
- Tokenizer FTS dibaca sekali per proses, bukan sekali per permintaan.
- Respons 200 /api/search di-cache dalam proses (LRU) dan diberi ETag
  lemah untuk revalidasi `If-None-Match`. Atur lewat `SEARCH_CACHE_TTL`
  (milidetik, default 60000) dan `SEARCH_CACHE_MAX` (default 2048);
  `SEARCH_CACHE_TTL=0` mematikan cache.
- `PRAGMA cache_size`/`mmap_size` disetel pada koneksi read-only.

`TRUST_PROXY=1` hanya untuk deployment di belakang reverse proxy
(Caddy/nginx) yang menyetel `x-forwarded-for`; tanpa itu, header tersebut
diabaikan agar rate limiter tidak bisa dilewati dengan header palsu.

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
tidak menunggu TTL. Hentikan dan jalankan ulang proses UI/API setelah swap
database; koneksi SQLite Bun yang sudah terbuka tidak dipakai lintas swap file.

Workflow `.github/workflows/deploy-pages.yml` dipertahankan sebagai CI/release
build: workflow melakukan checkout, memasang Bun dengan lockfile, menjalankan
lint/format/test/type check, membuat database dan SSR bundle, menjalankan
output validation, lalu mengunggah artefak release. Workflow itu tidak lagi
mendeploy ke GitHub Pages karena Pages hanya menyajikan file statis; jalankan
`ui/dist/server/entry.mjs` di VPS di belakang reverse proxy atau Cloudflare.

### Deployment dengan Docker

`Dockerfile` multi-tahap membangun database dan bundle SSR di dalam gambar;
tahap runtime hanya berisi `oven/bun:1-alpine`, `ui/dist`, sumber API,
`hono`, dan `search.sqlite` — tanpa devDependencies dan tanpa build tooling,
berjalan sebagai user non-root. Satu gambar melayani dua peran: server SSR UI
(peran default) dan API pencarian.

```bash
docker build -t tutur .

# UI SSR di 4321 (peran default)
docker run -p 4321:4321 tutur

# API pencarian di 3001 (peran kedua dari gambar yang sama)
docker run -p 3001:3001 -e PORT=3001 tutur bun api/src/index.ts
```

`SITE_URL`, `BASE_PATH`, dan `PUBLIC_SEARCH_API_URL` adalah build arg karena
nilainya disematkan ke aset client saat build; defaultnya
`http://localhost:4321`, `/`, dan `http://localhost:3001`. Untuk deployment,
tetapkan URL publik, contohnya:

```bash
docker build -t tutur \
  --build-arg SITE_URL=https://tutur.example \
  --build-arg PUBLIC_SEARCH_API_URL=https://tutur.example/api
```

`compose.yml` menjalankan kedua peran dari satu gambar, dengan healthcheck
`/health` pada API dan `depends_on` pada UI:

```bash
SITE_URL=https://tutur.example PUBLIC_SEARCH_API_URL=https://tutur.example/api \
  docker compose up --build
```

Database disalin ke dalam gambar dan hanya dibuka read-only. Untuk mengganti
database tanpa rebuild, mount file yang baru:

```bash
docker run -p 4321:4321 \
  -v "$PWD/api/data/search.sqlite:/app/api/data/search.sqlite:ro" tutur
```

`.dockerignore` membatasi build context hanya pada sumber JSON tiap dataset
(sekitar 110 MB setelah `data/kbbi-v6/` dan `data/indolex/` ikut dibawa); format
ekspor lama, `data/data-raw/`, dan `node_modules` tidak dikirim ke daemon.

## Ukuran keluaran dan validasi

`bun run build` mencetak metrik data, database, output, dan durasi; nilainya
dihitung dari source JSON saat build, bukan di-hard-code.

```text
DATA_METRICS       printed during data preparation
DB_METRICS         printed during SQLite generation
OUTPUT_METRICS     printed during output validation
A11Y_METRICS       printed during the accessibility audit
BUILD_DURATION_MS  printed after the complete build
```

Snapshot pengukuran dataset saat ini: 115.978 record menghasilkan 71.093
headword unik, 44.885 record duplikat, dan 63 collision slug; 38.364 headword
terenrich frekuensi, 68.245 headword membawa extras KBBI VI, dan 17.367
keluarga kata berisi 103.569 anggota. Build penuh terakhir selesai dalam
sekitar 34 detik; output Astro sekitar 1,73 MiB dan jumlah gzip per-file
sekitar 0,58 MiB. Database SQLite sekitar 261.513.216 byte dengan 82.447
record pencarian. Halaman kata contoh berukuran 36.709 byte; definisi tetap
terbaca tanpa JavaScript — satu-satunya hydration adalah island graf kata
korpus yang dimuat lazy. Bundle SearchIsland berukuran 108.301 byte (30.474
byte gzip), sedangkan CSS bersama 27.188 byte (5.936 byte gzip). Sitemap
menghasilkan 4 dokumen dengan 71.393 URL.

Validator memeriksa jumlah halaman kata, collision/duplicate route, title,
canonical, `h1`, definisi, hydration pada halaman kata, bagian enrichment
(frekuensi, keluarga kata, contoh, peribahasa, slang) pada halaman kata
terenrich, halaman `/populer/`, sitemap limits, link sitemap, ukuran output,
ukuran HTML, serta ukuran bundle JavaScript/CSS. Batas gagal utama adalah
route hilang/duplikat, definisi kosong, sitemap melebihi limit protokol,
output di atas 700 MB, atau runtime hydration pada halaman kata.

`bun run validate:a11y` menjalankan axe-core (`@axe-core/playwright`) pada
headless Chromium terhadap server SSR hasil build. Halaman yang diaudit:
beranda, daftar kata (`/huruf/a/` dan halaman 2), halaman kata, pencarian
(kondisi awal dan kondisi hasil setelah interaksi), about, sumber, 404, plus
empat halaman utama pada viewport mobile 375px. Aturan yang dipakai: WCAG 2.1/2.2
level A dan AA serta best practice axe. Build gagal bila ada violation; hasil
`incomplete` (misalnya panah dekoratif ber-`aria-hidden` yang tidak dapat
dipastikan kontrasnya) dicatat sebagai perlu tinjauan manual dan ditampilkan
dengan `A11Y_VERBOSE=1`.

## Data ownership dan disclaimer

Data di direktori source merupakan kurasi dari beberapa sumber publik dan
sebagian data relasi dibuat dengan bantuan AI. Sumber referensi yang disimpan
di repositori ini antara lain:

1. [KBBI Daring — Badan Pengembangan dan Pembinaan Bahasa (resmi)](https://kbbi.kemdikbud.go.id/)
2. [Ican Bachors — KBBI.sql](https://github.com/bachors/KBBI.sql)
3. [ManaSiWibi — KBBI-SQL-database](https://github.com/ManaSiWibi/KBBI-SQL-database)
4. [aryakdaniswara — kbbi-v6-full-csv](https://github.com/aryakdaniswara/kbbi-v6-full-csv)
5. [aryakdaniswara — kbbi-v6-categories](https://github.com/aryakdaniswara/kbbi-v6-categories)
6. [aryakdaniswara — kbbi-v6-wordlist](https://github.com/aryakdaniswara/kbbi-v6-wordlist)
7. [aryakdaniswara — kbbi-dataset-kbbi-v](https://github.com/aryakdaniswara/kbbi-dataset-kbbi-v)
8. [Definisi — kbbi (snapshot KBBI VI)](https://github.com/Definisi/kbbi)
9. [univzy — kbbi (re:KBBI VI)](https://github.com/univzy/kbbi)
10. [Lyon28 — Kamus Besar Bahasa Indonesia (Hugging Face)](https://huggingface.co/datasets/Lyon28/kamus-besar-bahasa-indonesia)
11. [raf555 — KBBI-api](https://github.com/raf555/kbbi-api)
12. [IndoLeX — frekuensi leksikal (Kaggle, CC BY-NC-SA 4.0)](https://www.kaggle.com/datasets/binhashem/indolex-indonesian-academic-lexical-dataset)
13. [nasalsabila — kamus-alay](https://github.com/nasalsabila/kamus-alay)
14. [Leipzig Corpora Collection — ind_mixed_2013 (korpus kalimat)](https://downloads.wortschatz-leipzig.de/corpora/ind_mixed_2013_1M.tar.gz)
15. Baku/nonbaku, sinonim, dan antonim pada direktori masing-masing.

Kepemilikan data kamus berada pada **Badan Pengembangan dan Pembinaan Bahasa,
Kementerian Pendidikan Dasar dan Menengah Republik Indonesia**. Tutur ini
tidak resmi; verifikasi ke sumber resmi sebelum penggunaan penting atau
komersial. Ketentuan hak cipta dan lisensi sumber tetap berlaku.

## Direktori data lama

Dokumentasi dan contoh konsumsi data sumber tetap tersedia di:

- [`data/edisi-IV/`](data/edisi-IV/)
- [`data/baku-nonbaku/`](data/baku-nonbaku/)
- [`data/sinonim/`](data/sinonim/)
- [`data/antonim/`](data/antonim/)
- [`data/indolex/`](data/indolex/)
- [`data/kamus-alay/`](data/kamus-alay/)
- [`data/kbbi-v6/`](data/kbbi-v6/)
- [`data/data-raw/`](data/data-raw/)
