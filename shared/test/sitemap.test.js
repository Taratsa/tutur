import { expect, test } from "bun:test";
import { splitSitemapUrls } from "../src/sitemap.js";

test("sitemap URL lists split at the protocol limit", () => {
  const urls = Array.from({ length: 50_001 }, (_, index) => `/kata/${index}/`);
  const parts = splitSitemapUrls(urls);
  expect(parts).toHaveLength(2);
  expect(parts[0]).toHaveLength(50_000);
  expect(parts[1]).toHaveLength(1);
});
