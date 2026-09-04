import { expect, test } from "bun:test";
import { createSlugMap } from "../src/slug.js";

test("slug generation is readable and stable", () => {
  const first = createSlugMap(["Bahasa", "tanggung jawab", "2-in-1", "Élan"]);
  const second = createSlugMap(["Élan", "2-in-1", "Bahasa", "tanggung jawab"]);
  expect(Object.fromEntries(first.wordToSlug)).toEqual(Object.fromEntries(second.wordToSlug));
  expect(first.wordToSlug.get("tanggung jawab")).toBe("tanggung-jawab");
  expect(first.wordToSlug.get("2-in-1")).toBe("2-in-1");
  expect(first.wordToSlug.get("élan")).toBe("elan");
});

test("distinct words that share a readable slug get stable suffixes", () => {
  const slugs = createSlugMap(["a/b", "a-b", "a b"]);
  expect(slugs.collisionCount).toBe(2);
  expect(new Set(slugs.wordToSlug.values()).size).toBe(3);
  expect(slugs.wordToSlug.get("a b")).toBe("a-b");
  expect(slugs.wordToSlug.get("a-b")).toBe("a-b-2");
  expect(slugs.wordToSlug.get("a/b")).toBe("a-b-3");
});
