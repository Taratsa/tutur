import { renderUrlset } from "../lib/sitemap.js";

const ejaanTopics = [
  "kata-pengantar",
  "surat-keputusan",
  "huruf-abjad",
  "huruf-vokal",
  "huruf-konsonan",
  "gabungan-huruf-vokal",
  "gabungan-huruf-konsonan",
  "huruf-kapital",
  "huruf-miring",
  "huruf-tebal",
  "kata-dasar",
  "kata-turunan",
  "pemenggalan-kata",
  "kata-depan",
  "partikel",
  "singkatan-dan-akronim",
  "angka-dan-bilangan",
  "kata-ganti",
  "kata-sandang",
  "tanda-titik",
  "tanda-koma",
  "tanda-titik-koma",
  "tanda-titik-dua",
  "tanda-hubung",
  "tanda-pisah",
  "tanda-tanya",
  "tanda-seru",
  "tanda-elipsis",
  "tanda-petik",
  "tanda-petik-tunggal",
  "tanda-kurung",
  "tanda-kurung-siku",
  "tanda-garis-miring",
  "tanda-penyingkat-apostrof",
  "serapan-umum",
  "serapan-khusus",
];

export function GET() {
  return new Response(
    renderUrlset([
      "/",
      "/populer/",
      "/about/",
      "/sumber/",
      "/kuis/",
      "/tebak-kata/",
      "/teka-silang/",
      "/rima/",
      "/ejaan/",
      ...ejaanTopics.map((slug) => `/ejaan/${slug}/`),
      "/dokumentasi-api/",
    ]),
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
