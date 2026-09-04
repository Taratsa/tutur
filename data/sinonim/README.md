# Sinonim

Data ini berisi informasi tentang padanan kata (sinonim) dalam Bahasa Indonesia. Saat ini tersedia kurang lebih `4.625` data sinonim.

## Format Data

Tersedia dalam berbagai format data:

- [MySQL](dictionary_sinonim__MySQL.sql)
- [SQLite](dictionary_sinonim__SQLite.sql)
- [PostgreSQL](dictionary_sinonim__PostgreSQL.sql)
- [CSV](dictionary_sinonim__CSV.csv)
- [JSON](dictionary_sinonim__JSON.json)
- [Markdown](dictionary_sinonim__MARKDOWN.md)
- [PHP Array](dictionary_sinonim__PHP_ARRAY.php)
- [XML](dictionary_sinonim__XML.xml)
- [DbUnit](dictionary_sinonim__DbUnit.xml)
- [HTML](dictionary_sinonim__HTML.html)
- [TEXT](dictionary_sinonim__TEXT.txt)

## Struktur Tabel

| Nama Field   | Tipe Data | Nullable | Keterangan                                                          |
| ------------ | --------- | -------- | ------------------------------------------------------------------- |
| id           | INTEGER   | NO       | Primary Key                                                         |
| kata_a       | TEXT      | NO       | Kata pertama                                                        |
| kata_b       | TEXT      | NO       | Kata kedua (padanan)                                                |
| jenis        | TEXT      | NO       | Jenis hubungan (misal: sinonim_satu_synset, varian_baku_tidak_baku) |
| penjelasan   | TEXT      | NO       | Penjelasan hubungan kata                                            |
| penggunaan_a | TEXT      | NO       | Contoh penggunaan kata_a                                            |
| penggunaan_b | TEXT      | NO       | Contoh penggunaan kata_b                                            |

## Contoh Data

| id  | kata_a | kata_b | jenis               | penjelasan                                                                            |
| --- | ------ | ------ | ------------------- | ------------------------------------------------------------------------------------- |
| 1   | aba    | ayah   | sinonim_satu_synset | 'aba' dan 'ayah' tervalidasi sebagai sinonim pada sekurang-kurangnya satu makna...    |
| 2   | abadi  | kekal  | sinonim_satu_synset | 'abadi' dan 'kekal' tervalidasi sebagai sinonim pada sekurang-kurangnya satu makna... |
