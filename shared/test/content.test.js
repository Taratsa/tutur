import { expect, test } from "bun:test";
import { groupDictionaryRecords } from "../src/grouping.js";
import { cleanMakna, definitionToText, sanitizeDefinition } from "../src/sanitize.js";

test("duplicate dictionary records group under one normalized headword", () => {
  const groups = groupDictionaryRecords([
    { _id: 2, word: " bahasa  ", arti: "dua" },
    { _id: 1, word: "BAHASA", arti: "satu" },
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].normalizedWord).toBe("bahasa");
  expect(groups[0].records).toHaveLength(2);
});

test("definition sanitization allows formatting but removes unsafe markup and attributes", () => {
  const sanitized = sanitizeDefinition(
    "&lt;b onclick=alert(1)&gt;Bahasa&lt;/b&gt;&lt;br&gt;&lt;script&gt;bad()&lt;/script&gt;",
  );
  expect(sanitized).toBe("<b>Bahasa</b><br>bad()");
  expect(sanitized).not.toContain("onclick");
  expect(sanitized).not.toContain("<script>");
  expect(definitionToText(sanitized)).toBe("Bahasa\nbad()");
});

test("definition sanitization keeps invalid numeric entities harmless", () => {
  expect(sanitizeDefinition("&#x110000; &#55296;")).toBe("&amp;#x110000; &amp;#55296;");
});

test("definition sanitization balances unclosed formatting tags", () => {
  expect(sanitizeDefinition("<i>tanpa penutup")).toBe("<i>tanpa penutup</i>");
  expect(sanitizeDefinition("<i><b>dua tag")).toBe("<i><b>dua tag</b></i>");
  expect(sanitizeDefinition("sudah </i>ditutup")).toBe("sudah ditutup");
  expect(sanitizeDefinition("<i>salah</b>urut</i>pasang")).toBe("<i>salahurut</i>pasang");
});

test("cleanMakna splits numbered sub-definitions and converts language tags", () => {
  expect(
    cleanMakna(
      "1. [n]  {Ling}  sistem lambang bunyi\n\n2. [n]  percakapan yang baik: \n\n3. [n]  sistem kata",
    ),
  ).toEqual(["[n] {Ling} sistem lambang bunyi", "[n] percakapan yang baik:", "[n] sistem kata"]);
});

test("cleanMakna keeps unnumbered continuations on one line", () => {
  expect(cleanMakna("ukp \n<Pr>  memberatkan (tentang kesaksian)")).toEqual([
    "ukp (Pr) memberatkan (tentang kesaksian)",
  ]);
  expect(cleanMakna("[n]  <It>  {Olr}  sebutan untuk pendukung fanatik")).toEqual([
    "[n] (It) {Olr} sebutan untuk pendukung fanatik",
  ]);
});

test("cleanMakna trims stray trailing semicolons and drops empties", () => {
  expect(cleanMakna("suka sekali; sayang benar: ;")).toEqual(["suka sekali; sayang benar:"]);
  expect(cleanMakna("")).toEqual([]);
  expect(cleanMakna(null)).toEqual([]);
});
