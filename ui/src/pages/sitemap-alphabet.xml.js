import { getAlphabetPaths } from "../lib/server-data.js";
import { renderUrlset } from "../lib/sitemap.js";

export const prerender = false;

export function GET() {
  return new Response(renderUrlset(getAlphabetPaths()), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
