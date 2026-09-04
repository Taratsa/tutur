# Leipzig Corpora Collection

Snapshot korpus bahasa Indonesia `ind_mixed_2013_100K` dalam format JSON
kanonis. Snapshot ini berisi 100.000 kalimat acak dari korpus campuran
Indonesia tahun 2013 dan ditujukan sebagai lapisan penggunaan bahasa, bukan
sebagai kamus definisi.

## Berkas

- [`leipzig_metadata__JSON.json`](leipzig_metadata__JSON.json): identitas
  snapshot, hash arsip, jumlah data, dan catatan provenance.
- [`leipzig_words__JSON.json`](leipzig_words__JSON.json): 133.046 tipe kata
  dengan `id`, `word`, dan `frequency`.
- [`leipzig_sentences__JSON.json`](leipzig_sentences__JSON.json): 100.000
  kalimat dengan `id` dan `text`.
- [`leipzig_word_sentence_index__JSON.json`](leipzig_word_sentence_index__JSON.json):
  indeks `word_id` ke daftar `sentence_ids` untuk pencarian kata dalam kalimat
  yang sama.
- [`leipzig_neighbour_cooccurrences__JSON.json`](leipzig_neighbour_cooccurrences__JSON.json):
  71.456 pasangan kata bertetangga dengan frekuensi dan signifikansi.
- [`leipzig_sentence_cooccurrences__JSON.json`](leipzig_sentence_cooccurrences__JSON.json):
  378.892 pasangan kata yang muncul dalam kalimat yang sama dengan frekuensi
  dan signifikansi.

Semua relasi menyimpan ID numerik dari `leipzig_words__JSON.json` agar data
tidak mengulang teks kata. Untuk `co_n`, `word1_id` dan `word2_id` mengikuti
arah kiri-ke-kanan dari format sumber. Untuk `co_s`, keduanya adalah pasangan
kata dalam satu kalimat.

## Reproduksi fitur Tutur

- **Words occurring in the same sentence:** ambil `sentence_ids` dari indeks
  kata, lalu join ke `leipzig_sentences`.
- **Neighbour cooccurrences:** filter `word1_id` atau `word2_id` pada data
  `leipzig_neighbour_cooccurrences`; gunakan `significance` untuk urutan.
- **Words with similar context:** gunakan gabungan profil signifikan dari
  `co_n` dan `co_s`, lalu hitung kemiripan antarpofil. Arsip unduhan ini tidak
  menyertakan file sumber `sim_w_co`, jadi skor kemiripan belum disalin sebagai
  data resmi. Dokumentasi format Leipzig menjelaskan cosine similarity,
  sedangkan FAQ portal menjelaskan Dice coefficient; parameter dan ambang
  portal perlu dicocokkan sebelum mengklaim hasil identik.

Reproduksi lokal tersedia melalui
[`scripts/build_leipzig_similarity.py`](../scripts/build_leipzig_similarity.py).
Perintah ini memakai profil biner yang disimetriskan dari edge `co_n` dan
`co_s`, cosine similarity, `min_shared=2`, dan `top_k=20` secara default.
Profil menyimpan tipe relasi sebagai fitur terpisah. Hasilnya adalah derivasi
lokal yang reproducible, bukan salinan atau klaim identitas terhadap tabel
portal `sim_w_co`.

Contoh:

```sh
python3 scripts/build_leipzig_similarity.py \
  --word bahasa --top-k 20 --output /tmp/bahasa-similarity.json
```

Indeks posisi kata sumber sengaja tidak disalin karena fitur yang ditargetkan
hanya memerlukan keanggotaan kalimat. `sources`, `inv_so`, dan SQL import juga
tidak disalin karena tidak diperlukan untuk tiga fitur tersebut.

## Provenance

- Korpus: [Indonesian mixed corpus based on material from 2013](https://corpora.uni-leipzig.de/en?corpusId=ind_mixed_2013)
- Katalog und Größenwahl: [Download Corpora Indonesian](https://wortschatz-leipzig.de/en/download/ind#ind_mixed_2013)
- Arsip yang diambil: [`ind_mixed_2013_100K.tar.gz`](https://downloads.wortschatz-leipzig.de/corpora/ind_mixed_2013_100K.tar.gz)
- Spesifikasi format: [Format download file](https://wortschatz.informatik.uni-leipzig.de/documents/Format_Download_File-eng.pdf) ([URL katalog](https://wortschatz-leipzig.de/documents/Format_Download_File-eng.pdf))
- Penjelasan cooccurrence dan similarity: [Leipzig data FAQ](https://www.wortschatz.uni-leipzig.de/en/documentation/faq)
- Ketentuan penggunaan: [Wortschatz Terms of Usage](https://wortschatz-leipzig.de/en/usage)

Arsip sumber SHA-256:

`526a30ad4414d793f8a94744112d8f179f9e6aeb95f983d94b9ed93bd786ed57`

Dokumentasi Leipzig menyatakan korpus yang diunduh tersedia dengan atribusi
CC BY. Kalimat berasal dari dokumen Internet yang diproses otomatis, sehingga
hasil dapat mengandung typo, fragmen tokenizer, variasi bahasa, dan materi
yang tunduk pada ketentuan sumber asal. Lihat FAQ dan ketentuan penggunaan
sebelum redistribusi.
