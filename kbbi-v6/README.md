# KBBI Edisi VI

Snapshot JSON terstruktur KBBI Edisi VI dari ekstraksi aplikasi resmi KBBI
versi 6.0.2 yang dipublikasikan oleh [Definisi/kbbi](https://github.com/Definisi/kbbi).
Data ini disimpan sebagai koleksi terpisah dan tidak menggantikan KBBI Edisi IV.

## Berkas

- [JSON](kbbi_v6__JSON.json) — 194.692 entri dengan struktur bersarang.

## Statistik

| Field | Entri berisi |
| :--- | ---: |
| `kata` | 194.692 |
| `makna` | 193.869 |
| `contoh` | 35.072 |
| `turunan` | 11.481 |
| `gabungan_kata` | 10.187 |
| `peribahasa` | 1.407 |
| `etimologi` | 102 |
| `pelafalan` | 19.115 |
| `kiasan` | 375 |
| `varian` | 81 |

Field kosong tidak disertakan pada objek. Nilai `kata` dan `lema` dipertahankan
seperti pada snapshot sumber; `makna`, `contoh`, dan relasi lain disimpan dalam
bentuk array.

Sebanyak 823 objek tidak memiliki `makna`; sebagian merupakan entri rujukan
atau bentuk turunan. Jangan menganggap setiap nilai `kata` sebagai lema utama
dengan definisi.

## Sumber dan reproduksibilitas

- Sumber: <https://github.com/Definisi/kbbi>
- Commit sumber: `24a08c7ed9ec8da9988b1f8e9f614c477f84fc8e`
- Berkas sumber: <https://raw.githubusercontent.com/Definisi/kbbi/24a08c7ed9ec8da9988b1f8e9f614c477f84fc8e/kbbi_v6_data.json>
- SHA-256 snapshot: `8e946e9df4fbf0722e84df26e928df69115fea52d0df269394a8fbbd56c1ffe1`
- Validasi snapshot: 194.692 objek, tanpa objek `error`.

Sumber memperingatkan adanya bug decompiler JADX yang dapat memengaruhi kunci
dekripsi. Snapshot ini dipertahankan apa adanya; pemeriksaan isi per entri
tetap diperlukan sebelum dipakai sebagai data produksi.

## Hak penggunaan

README sumber menyatakan bahwa data kamus adalah milik Badan Pengembangan dan
Pembinaan Bahasa, Kemendikdasmen, dan menyediakan skrip ekstraksi untuk
keperluan pendidikan dan penelitian. Tidak ada lisensi data terbuka yang
diberikan. Salinan ini dipertahankan untuk referensi dataset sesuai permintaan
proyek; jangan menganggapnya sebagai izin redistribusi atau penggunaan
komersial.
