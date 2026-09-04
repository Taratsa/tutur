import { getSiteStats } from "../lib/server-data.js";
import { renderSitemapIndex } from "../lib/sitemap.js";

export const prerender = false;

export function GET() {
  const stats = getSiteStats();
  const parts = Math.ceil(stats.uniqueHeadwords / 50_000);
  const words = Array.from({ length: parts }, (_, index) => `/sitemap-words/${index + 1}.xml`);
  return new Response(
    renderSitemapIndex(["/sitemap-static.xml", "/sitemap-alphabet.xml", ...words]),
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
