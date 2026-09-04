# Baku Non-Baku

Data ini berisi informasi tentang pasangan kata baku dan kata non-baku beserta penjelasannya.

## Format Data

Tersedia dalam berbagai format data:

- [MySQL](dictionary_baku_nonbaku__MySQL.sql)
- [SQLite](dictionary_baku_nonbaku__SQLite.sql)
- [PostgreSQL](dictionary_baku_nonbaku__PostgreSQL.sql)
- [CSV](dictionary_baku_nonbaku__CSV.csv)
- [JSON](dictionary_baku_nonbaku__JSON.json)
- [Markdown](dictionary_baku_nonbaku__MARKDOWN.md)
- [PHP Array](dictionary_baku_nonbaku__PHP_ARRAY.php)
- [XML](dictionary_baku_nonbaku__XML.xml)
- [DbUnit](dictionary_baku_nonbaku__DbUnit.xml)
- [HTML](dictionary_baku_nonbaku__HTML.html)
- [TEXT](dictionary_baku_nonbaku__TEXT.txt)

## Struktur Tabel

| Nama Field | Tipe Data | Nullable | Keterangan           |
| ---------- | --------- | -------- | -------------------- |
| id         | INT       | YES      | Primary Key          |
| word       | TEXT      | NO       | Kata baku            |
| wrong      | TEXT      | NO       | Kata non-baku        |
| explain    | TEXT      | NO       | Penjelasan atau arti |
| clue       | TEXT      | YES      | Petunjuk             |

## Contoh Data

| id  | word (baku) | wrong (non baku) | explain (keterangan)                                                                        | clue (petunjuk)                                            |
| --- | ----------- | ---------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Apotek      | Apotik           | Kata yang baku menurut KBBI adalah APOTEK, sedangkan APOTIK merupakan bentuk tidak bakunya. | **_ /apoték/ n toko tempat meramu dan menjual obat ... _** |
