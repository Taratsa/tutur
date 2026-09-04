export const WORDS_PER_PAGE = 250;
export const LETTER_ORDER = [
  "0-9",
  ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index)),
  "lainnya",
];

export function pageCount(words) {
  return Math.max(1, Math.ceil(words.length / WORDS_PER_PAGE));
}

export function pageWords(words, page) {
  const start = (page - 1) * WORDS_PER_PAGE;
  return words.slice(start, start + WORDS_PER_PAGE);
}

export function letterPath(letter, page = 1) {
  return page === 1 ? `/huruf/${letter}/` : `/huruf/${letter}/${page}/`;
}
