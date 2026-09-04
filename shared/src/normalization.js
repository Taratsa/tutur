const INDONESIAN_LOCALE = "id-ID";

export function normalizeWord(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase(INDONESIAN_LOCALE);
}

export function displayWord(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
}

export function tokenText(value) {
  return normalizeWord(value)
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function wordLetter(value) {
  const first = Array.from(normalizeWord(value))[0] ?? "";
  if (/^[a-z]$/u.test(first)) return first;
  if (/^[0-9]$/u.test(first)) return "0-9";
  return "lainnya";
}

export function characterCount(value) {
  return Array.from(normalizeWord(value)).length;
}
