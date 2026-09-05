# Kaikki Indonesian dictionary data

Snapshot postprocessed JSONL dari:

- Halaman: <https://kaikki.org/dictionary/Indonesian/index.html>
- Arsip: <https://kaikki.org/dictionary/Indonesian/kaikki.org-dictionary-Indonesian.jsonl.gz>
- Dasar ekstraksi snapshot ini: enwiktionary dump 2026-08-05, diproses
  2026-08-28 melalui [Wiktextract](https://github.com/tatuylonen/wiktextract).

Tutur hanya mengambil record lang_code=id yang cocok dengan headword KBBI,
lalu menyimpan metadata leksikal terpilih: kelas kata, IPA, etimologi,
bentuk kata, turunan, dan sinonim. Metadata ini ditampilkan sebagai pelengkap,
bukan sebagai definisi resmi KBBI.

Data teks Wiktionary dilisensikan di bawah
[CC BY-SA 4.0 atau GFDL](https://en.wiktionary.org/wiki/Wiktionary:Copyrights);
ketentuan sumber dan atribusi tetap berlaku. Kaikki menyatakan tautan ke
halaman yang relevan sangat dihargai. Berkas ini adalah snapshot sumber untuk
build, bukan endpoint runtime.
