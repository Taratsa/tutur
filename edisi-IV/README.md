# KBBI Edisi IV (Kamus Utama)

Direktori ini menyimpan data utama Kamus Besar Bahasa Indonesia (KBBI) Edisi IV yang memuat total `115.978` kosakata. Data disediakan dalam berbagai format berkas terstruktur guna memudahkan integrasi pada berbagai platform aplikasi.

## Format Data Tersedia

Anda dapat menggunakan data ini dalam format-format berikut:

- **Format Basis Data:**
  - [MySQL (SQL)](dictionary__MySQL.sql)
  - [SQLite (SQL)](dictionary__SQLite.sql)
  - [PostgreSQL (SQL)](dictionary__PostgreSQL.sql)
- **Format Pertukaran Data & Dokumen:**
  - [CSV](dictionary__CSV.csv)
  - [JSON](dictionary__JSON.json)
  - [Markdown](dictionary__MARKDOWN.md)
  - [PHP Array](dictionary__PHP_ARRAY.php)
  - [XML](dictionary__XML.xml)
  - [DbUnit (XML)](dictionary__DbUnit.xml)
  - [HTML](dictionary__HTML.html)

---

## Spesifikasi Struktur Tabel

Tabel kamus utama menggunakan nama entitas `dictionary` dengan rincian skema sebagai berikut:

| Nama Kolom (Field) | Tipe Data      | Kunci (Key) | Nullable | Keterangan                                           |
| :----------------- | :------------- | :---------- | :------- | :--------------------------------------------------- |
| `_id`              | INTEGER        | PRIMARY KEY | NO       | Identifikasi unik entri data (Auto Increment)        |
| `word`             | TEXT / VARCHAR | -           | NO       | Kata atau kosakata                                   |
| `arti`             | TEXT           | -           | YES      | Penjelasan, arti kata, atau definisi                 |
| `type`             | INTEGER        | -           | YES      | Kategori format data (1: HTML markup, 2: Plain Text) |

---

## Skrip SQL Pembuatan Tabel (`CREATE TABLE`)

Berikut adalah kueri (query) standar pembuatan tabel `dictionary` untuk beberapa sistem manajemen basis data (DBMS):

### 1. PostgreSQL

```sql
CREATE TABLE dictionary (
    _id SERIAL PRIMARY KEY,
    word VARCHAR(255) NOT NULL,
    arti TEXT,
    type INTEGER
);

-- Pembuatan indeks untuk optimasi pencarian kata
CREATE INDEX idx_dictionary_word ON dictionary(word);
```

### 2. MySQL

```sql
CREATE TABLE `dictionary` (
    `_id` INT AUTO_INCREMENT PRIMARY KEY,
    `word` VARCHAR(255) NOT NULL,
    `arti` TEXT NULL,
    `type` INT NULL,
    INDEX `idx_word` (`word`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3. SQLite

```sql
CREATE TABLE dictionary (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    arti TEXT,
    type INTEGER
);

-- Pembuatan indeks untuk optimasi pencarian kata
CREATE INDEX idx_dictionary_word ON dictionary(word);
```
