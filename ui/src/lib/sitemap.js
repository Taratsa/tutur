import { absoluteRoute } from "./site.js";
import { letterPath, pageCount } from "./alphabet.js";
import { splitSitemapUrls } from "@tutur/shared/sitemap";

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderUrlset(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${xmlEscape(absoluteRoute(path))}</loc></url>`).join("")}</urlset>`;
}

export function renderSitemapIndex(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<sitemap><loc>${xmlEscape(absoluteRoute(path))}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function alphabetPaths(data) {
  return Object.entries(data.letters).flatMap(([letter, slugs]) =>
    Array.from({ length: pageCount(slugs) }, (_, index) => letterPath(letter, index + 1)),
  );
}

export function wordSitemapParts(data) {
  return splitSitemapUrls(data.entries.map((entry) => `/kata/${entry.slug}/`));
}

export { xmlEscape };
