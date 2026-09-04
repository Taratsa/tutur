import { renderUrlset } from "../lib/sitemap.js";

export function GET() {
  return new Response(renderUrlset(["/", "/populer/", "/about/", "/sumber/"]), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
