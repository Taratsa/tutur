# IndoLeX

IndoLeX adalah dataset frekuensi leksikal bahasa Indonesia yang menghubungkan
bentuk kata dengan akar katanya. Dataset Kaggle menyatakan bahwa frekuensinya
dihitung dari korpus lebih dari 110 juta kata dan kata-katanya divalidasi
terhadap KBBI.

## Berkas

- [`indolex__JSON.json`](indolex__JSON.json): `131.534` bentuk kata unik.
- [`indolex_root_frequencies__JSON.json`](indolex_root_frequencies__JSON.json): `26.956` akar kata berperingkat.
- [`kbbi_edisi_iv_enrichment__JSON.json`](kbbi_edisi_iv_enrichment__JSON.json): tabel join-ready untuk KBBI Edisi IV.

Kolom `Definition` dari file sumber tidak disertakan. Salinan ini hanya
membawa data leksikal dan frekuensi sehingga tidak menggantikan definisi yang
sudah ada pada KBBI Edisi IV.

## Struktur

Root key `indolex`:

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `word` | string | Bentuk kata |
| `frequency` | integer | Frekuensi bentuk kata |
| `category` | string | `kbbi_direct` atau `kbbi_derived` |
| `root` | string | Akar kata |

Root key `indolex_root_frequencies`:

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `rank` | integer | Peringkat frekuensi akar |
| `word` | string | Akar kata |
| `frequency` | integer | Frekuensi akar dan turunannya |

Root key `dictionary_enrichment`:

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `word` | string | Kunci join `trim(lower(word))` |
| `frequency` | integer | Frekuensi bentuk kata |
| `root` | string | Akar kata |
| `category` | string | Kategori IndoLeX |
| `root_rank` | integer | Peringkat akar kata |
| `root_frequency` | integer | Frekuensi akar kata |

## Hasil pencocokan

Pencocokan case-insensitive dengan `trim()` terhadap
`edisi-IV/dictionary__JSON.json` menghasilkan `38.364` kata. Semua yang cocok
berkategori `kbbi_direct`; frekuensinya mencakup `97.762.545` dari total
`107.328.932` token IndoLeX (`91,09%`). Sebanyak `26.907` dari `26.956` akar
kata juga cocok, mencakup `99,99%` frekuensi akar.

Gunakan tabel enrichment untuk menggabungkan frekuensi dan akar tanpa mengubah
berkas KBBI utama:

```sql
SELECT dictionary.*, enrichment.frequency, enrichment.root,
       enrichment.category, enrichment.root_rank, enrichment.root_frequency
FROM dictionary
LEFT JOIN dictionary_enrichment AS enrichment
  ON lower(trim(dictionary.word)) = enrichment.word;
```

Frekuensi berasal dari korpus, bukan peringkat resmi KBBI. Bentuk `kbbi_derived`
yang tidak cocok dengan Edisi IV tetap tersedia di tabel IndoLeX dan tidak
dipaksa masuk ke kamus utama.

## Sumber dan lisensi

- [IndoLeX di Kaggle](https://www.kaggle.com/datasets/binhashem/indolex-indonesian-academic-lexical-dataset)
- [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

Salinan ini berasal dari dataset Kaggle versi 2 yang diperbarui pada 10 Agustus
2025. Deskripsi sumber menyatakan bahwa definisi bersumber dari KBBI Edisi V
dan hak cipta definisi berada pada Badan Pengembangan dan Pembinaan Bahasa;
kolom definisi tersebut sengaja tidak disalin.
