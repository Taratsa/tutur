const INDONESIAN_LOCALE = "id-ID";

export function normalizeWord(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase(INDONESIAN_LOCALE);
}

export function displayWord(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
}

export function tokenText(value: string): string {
  return normalizeWord(value)
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function wordLetter(value: string): string {
  const first = Array.from(normalizeWord(value))[0] ?? "";
  if (/^[a-z]$/u.test(first)) return first;
  if (/^[0-9]$/u.test(first)) return "0-9";
  return "lainnya";
}

export function characterCount(value: string): number {
  return Array.from(normalizeWord(value)).length;
}
