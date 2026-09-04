# Kamus Alay

Koleksi ini memetakan kata slang atau colloquial bahasa Indonesia ke bentuk
normalnya. Data disimpan terpisah dari KBBI dan Baku & Nonbaku karena pasangan
slang tidak selalu merupakan pasangan ejaan baku/nonbaku.

## Berkas

- [`dictionary_kamus_alay__JSON.json`](dictionary_kamus_alay__JSON.json)

## Struktur JSON

Root key: `dictionary_kamus_alay`

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `id` | integer | ID lokal setelah deduplikasi |
| `slang` | string | Bentuk colloquial |
| `formal` | string | Bentuk normal menurut sumber |
| `in_dictionary` | boolean | Penanda kamus dari sumber |
| `categories` | array[string] | Kategori perubahan kata |

Sumber CSV memuat `15.006` baris contoh. Salinan ini mempertahankan `4.459`
kombinasi unik slang, bentuk normal, penanda kamus, dan kategori; kolom
`context` tidak disertakan karena berisi komentar Instagram dan handle pengguna.

Dataset card SEACrowd menyebut `3.592` kata colloquial, sedangkan CSV sumber
yang tersedia saat pengambilan menghasilkan `4.330` bentuk slang unik setelah
normalisasi huruf besar-kecil. Perbedaan ini dicatat agar jumlah tidak dianggap
sebagai klaim resmi yang stabil.

## Sumber dan lisensi

- [SEACrowd/kamus_alay](https://huggingface.co/datasets/SEACrowd/kamus_alay)
- [Repositori sumber](https://github.com/nasalsabila/kamus-alay)
- [Colloquial Indonesian Lexicon, IALP 2018](https://doi.org/10.1109/IALP.2018.8629151)

Lisensi sumber tercantum sebagai **Unknown**. Klarifikasi hak redistribusi
sebaiknya diperoleh sebelum penggunaan komersial atau redistribusi lebih lanjut.
