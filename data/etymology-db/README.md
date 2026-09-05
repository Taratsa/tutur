# Etymology DB Bahasa Indonesia

Potongan Bahasa Indonesia dari release `2023-12` milik
[`droher/etymology-db`](https://github.com/droher/etymology-db). Dataset ini
menyimpan hubungan etimologi terstruktur, bukan definisi KBBI dan bukan klaim
otoritatif Badan Bahasa. Sumbernya sendiri dibuat dengan mem-parsing bagian
etimologi Wiktionary.

## Berkas

- [`etymology_db_indonesian__JSON.json`](etymology_db_indonesian__JSON.json):
  `39.605` baris relasi untuk `10.284` istilah casefolded.
- [`etymology_metadata__JSON.json`](etymology_metadata__JSON.json): release,
  hash aset, cakupan, bahasa terkait, tipe relasi, dan catatan lisensi.

Semua baris dengan `lang` Indonesian dipertahankan, termasuk baris struktur
`group_*` yang diperlukan untuk merekonstruksi hubungan bertingkat. Kolom
kosong dinormalisasi menjadi `null`, sedangkan `position` dan
`parent_position` menjadi integer. Urutan baris sumber dipertahankan.

## Skema

Kolom relasi mengikuti CSV sumber: `term_id`, `lang`, `term`, `reltype`,
`related_term_id`, `related_lang`, `related_term`, `position`, `group_tag`,
`parent_tag`, dan `parent_position`. `reltype` membedakan, antara lain,
`borrowed_from`, `inherited_from`, `derived_from`, `compound_of`, `cognate_of`,
`calque_of`, dan relasi afiks.

`group_affix_root`, `group_derived_root`, dan `group_related_root` adalah node
struktur, bukan hubungan leksikal yang boleh dibaca sebagai etimologi langsung.
Sumber memperingatkan bahwa hasil parsing semi-terstruktur belum divalidasi
secara sistematis.

## Provenance dan reproduksi

- [Repositori sumber](https://github.com/droher/etymology-db)
- [Release `2023-12`](https://github.com/droher/etymology-db/releases/tag/2023-12)
- [Aset CSV.GZ](https://github.com/droher/etymology-db/releases/download/2023-12/etymology.csv.gz)
- [README dan skema sumber](https://github.com/droher/etymology-db/blob/master/README.md)

Aset penuh berukuran `143.436.769` byte dan berisi `4.222.599` baris. Aset
penuh tidak disalin ke repositori; hanya slice `lang=Indonesian` yang disimpan.
SHA-256 aset penuh yang diimpor:

`e36eba331b73075fd74c8281b96eb3b31bebc510dad091ddeb815453a49d594d`

```sh
curl -fL -o /tmp/etymology-2023-12.csv.gz \
  'https://github.com/droher/etymology-db/releases/download/2023-12/etymology.csv.gz'
python3 scripts/import_etymology_db.py \
  --input /tmp/etymology-2023-12.csv.gz \
  --output etymology-db --generated-at 2026-09-05
```

## Lisensi

README sumber menyatakan data berlisensi Creative Commons ShareAlike 3.0 dan
kode berlisensi Apache 2.0. Berkas yang disalin di sini adalah data, bukan
kode sumber. Karena data diekstrak dari Wiktionary, ketentuan dan atribusi
Wiktionary yang mendasarinya tetap berlaku; pertahankan atribusi dan kewajiban
share-alike saat mendistribusikan hasilnya.
