export const SITEMAP_URL_LIMIT = 50_000;
export const SITEMAP_BYTE_LIMIT = 50 * 1024 * 1024;

export function splitSitemapUrls(urls: string[], maxUrls = SITEMAP_URL_LIMIT): string[][] {
  if (!Number.isInteger(maxUrls) || maxUrls < 1) {
    throw new RangeError("maxUrls must be a positive integer");
  }
  const parts: string[][] = [];
  for (let index = 0; index < urls.length; index += maxUrls) {
    parts.push(urls.slice(index, index + maxUrls));
  }
  return parts;
}
