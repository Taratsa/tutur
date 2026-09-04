import { absoluteRoute, sitePath } from "../lib/site.js";

export const prerender = true;

export function GET() {
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: ${sitePath("/search/")}\nSitemap: ${absoluteRoute("/sitemap-index.xml")}\n`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
