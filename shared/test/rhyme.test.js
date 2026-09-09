import { describe, expect, test } from "bun:test";
import { alliterationKey, rhymeKey } from "../src/rhyme.js";

describe("rhyme key (rima akhir)", () => {
  test("takes the tail from the last vowel", () => {
    expect(rhymeKey("bahasa")).toBe("asa");
    expect(rhymeKey("rasa")).toBe("asa");
    expect(rhymeKey("makan")).toBe("an");
    expect(rhymeKey("sampai")).toBe("ai");
  });

  test("includes the previous vowel for open final syllables", () => {
    expect(rhymeKey("puasa")).toBe("asa");
    expect(rhymeKey("buku")).toBe("uku");
    expect(rhymeKey("cinta")).toBe("inta");
  });

  test("folds diacritics before matching vowels", () => {
    expect(rhymeKey("abdomên")).toBe("en");
    expect(rhymeKey("ÉTÉ")).toBe("ete");
  });

  test("rhymes on the last word of a phrase", () => {
    expect(rhymeKey("alih bahasa")).toBe("asa");
    expect(rhymeKey("es krim")).toBe("im");
  });

  test("falls back to the whole word without vowels", () => {
    expect(rhymeKey("bpk")).toBe("bpk");
  });

  test("keeps keys URL-safe", () => {
    expect(rhymeKey("dua-dimensi")).toMatch(/^[a-z0-9]+$/u);
    expect(rhymeKey("kbbi—sql!")).toMatch(/^[a-z0-9]+$/u);
  });
});

describe("alliteration key (rima awal)", () => {
  test("takes the onset plus the first vowel", () => {
    expect(alliterationKey("bahasa")).toBe("ba");
    expect(alliterationKey("baku")).toBe("ba");
    expect(alliterationKey("struktur")).toBe("stru");
  });

  test("includes the next vowel when the word starts with a vowel", () => {
    expect(alliterationKey("abadi")).toBe("aba");
    expect(alliterationKey("abang")).toBe("aba");
    expect(alliterationKey("ia")).toBe("ia");
  });

  test("folds diacritics", () => {
    expect(alliterationKey("Abdomên")).toBe("abdo");
  });

  test("falls back to the whole word without vowels", () => {
    expect(alliterationKey("bpk")).toBe("bpk");
  });
});
