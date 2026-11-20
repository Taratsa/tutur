// Daftar korpus Leipzig yang digabung menjadi graf kata Tutur. Dipakai oleh
// fetch-leipzig.ts (unduh), convert-leipzig.ts (konversi), dan
// prepare-word-graph.ts (penggabungan). Tiap korpus disimpan di
// data/leipzig/<id>/ karena ID kata dan kalimatnya berdiri sendiri.
export const LEIPZIG_CORPORA = ["ind_mixed_2013", "ind_wikipedia_2016"] as const;

export type LeipzigCorpus = (typeof LEIPZIG_CORPORA)[number];

export const LEIPZIG_DOWNLOAD_BASE = "https://downloads.wortschatz-leipzig.de/corpora";

// "ind_wikipedia_2016_1M" -> "ind_wikipedia_2016"
export const corpusBaseId = (corpusId: string): string => corpusId.replace(/_\d+[KM]$/u, "");
