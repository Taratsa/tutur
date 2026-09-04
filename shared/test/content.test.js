import { expect, test } from "bun:test";
import { groupDictionaryRecords } from "../src/grouping.js";
import { definitionToText, sanitizeDefinition } from "../src/sanitize.js";

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
