import { getWordPaths } from "../../lib/server-data.js";
import { renderUrlset } from "../../lib/sitemap.js";
import { splitSitemapUrls } from "@tutur/shared/sitemap";

export const prerender = false;

export function GET({ params }) {
  const part = Number.parseInt(params.part ?? "", 10);
  const parts = splitSitemapUrls(getWordPaths());
  if (!/^\d+$/u.test(params.part ?? "") || String(part) !== params.part || !parts[part - 1])
    return new Response("Not found", { status: 404 });
  return new Response(renderUrlset(parts[part - 1]), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
