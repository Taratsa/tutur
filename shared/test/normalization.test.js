import { describe, expect, test } from "bun:test";
import { characterCount, normalizeWord, tokenText, wordLetter } from "../src/normalization.js";

describe("word normalization", () => {
  test("trims and collapses spaces", () => {
    expect(normalizeWord("  tanggung   jawab  ")).toBe("tanggung jawab");
  });

  test("preserves meaningful punctuation and hyphens", () => {
    expect(normalizeWord("KBBI—SQL!")).toBe("kbbi—sql!");
    expect(normalizeWord("dua-dimensi")).toBe("dua-dimensi");
  });

  test("keeps numbers and normalizes Unicode consistently", () => {
    const hyphen = String.fromCodePoint(0x2010);
    expect(normalizeWord("  2‑IN‑1  ")).toBe(`2${hyphen}in${hyphen}1`);
    expect(normalizeWord("ÉTÉ")).toBe("été");
    expect(characterCount("été")).toBe(3);
  });

  test("uses Indonesian-compatible casing", () => {
    expect(normalizeWord("BAHASA Indonesia")).toBe("bahasa indonesia");
  });

  test("creates search tokens and letter buckets", () => {
    expect(tokenText("tanggung-jawab/2")).toBe("tanggung jawab 2");
    expect(wordLetter("Bahasa")).toBe("b");
    expect(wordLetter("2-in-1")).toBe("0-9");
    expect(wordLetter("Élan")).toBe("lainnya");
  });
});
