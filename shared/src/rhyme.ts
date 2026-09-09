import { tokenText } from "./normalization";

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
}

function lastWordOf(text: string): string {
  return text.split(" ").pop() ?? "";
}

function findLastVowel(word: string, end: number): number {
  for (let index = end - 1; index >= 0; index -= 1) {
    if (VOWELS.has(word[index])) return index;
  }
  return -1;
}

function findFirstVowel(word: string, start: number): number {
  for (let index = start; index < word.length; index += 1) {
    if (VOWELS.has(word[index])) return index;
  }
  return -1;
}

// Rima akhir: kunci adalah isi kata dari vokal terakhir yang relevan.
export function rhymeKey(value: unknown): string {
  const lastWord = lastWordOf(fold(tokenText(value)));
  const lastVowel = findLastVowel(lastWord, lastWord.length);
  if (lastVowel === -1) return lastWord;
  // Suku kata terbuka (berakhir pada vokal): rima mencakup vokal sebelumnya
  // agar "bahasa" dan "rasa" berbagi kunci "-asa", bukan sekadar "-a".
  const start = lastVowel === lastWord.length - 1 ? findLastVowel(lastWord, lastVowel) : lastVowel;
  return lastWord.slice(start === -1 ? 0 : start);
}

// Rima awal (aliterasi): kunci adalah konsonan pembuka plus vokal pertama.
export function alliterationKey(value: unknown): string {
  const lastWord = lastWordOf(fold(tokenText(value)));
  const firstVowel = findFirstVowel(lastWord, 0);
  if (firstVowel === -1) return lastWord;
  // Tanpa konsonan pembuka: kunci mencakup vokal berikutnya agar "abadi"
  // dan "abang" berbagi kunci "aba", bukan sekadar "a".
  const end = firstVowel === 0 ? findFirstVowel(lastWord, firstVowel + 1) : firstVowel;
  return lastWord.slice(0, end === -1 ? lastWord.length : end + 1);
}
