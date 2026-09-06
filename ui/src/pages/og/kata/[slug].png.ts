import type { APIRoute } from "astro";
import sharp from "sharp";
import taratsaIcon from "../../../../public/favicon.png?inline";
import { getWordCard } from "../../../lib/server-data.js";
import { SITE_URL, sitePath } from "../../../lib/site.js";

export const prerender = false;

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

function lines(value: string, width = 58, limit = 3) {
  const words = value.replace(/\s+/gu, " ").trim().split(" ");
  const result: string[] = [];
  for (const word of words) {
    const current = result.at(-1) ?? "";
    if (!current) {
      result.push(word);
    } else if (current.length + word.length + 1 <= width) {
      result[result.length - 1] = `${current} ${word}`;
    } else if (result.length < limit) {
      result.push(word);
    } else {
      break;
    }
  }
  if (words.join(" ").length > result.join(" ").length) {
    result[result.length - 1] = `${result.at(-1)?.replace(/[.,;:]?$/u, "") ?? ""}…`;
  }
  return result;
}

export const GET: APIRoute = async ({ params }) => {
  const entry = getWordCard(params.slug ?? "") as {
    id: number;
    word: string;
    summary: string;
    syllabifications: string[];
    pronunciations: string[];
  } | null;
  if (!entry) return new Response("Kata tidak ditemukan", { status: 404 });

  const wordLines = lines(entry.word, 32, 2);
  const longestWordLine = Math.max(...wordLines.map((line) => line.length));
  const wordSize = Math.min(108, Math.max(52, Math.floor(1040 / (longestWordLine * 0.58))));
  const wordY = wordLines.length > 1 ? 245 : 300;
  const word = wordLines
    .map((line, index) => `<tspan x="80" y="${wordY + index * 70}">${escapeXml(line)}</tspan>`)
    .join("");
  const hasReadings = entry.syllabifications.length > 0 || entry.pronunciations.length > 0;
  const summary = lines(entry.summary || "Definisi tersedia di Tutur.", 58, hasReadings ? 2 : 3)
    .map((line, index) => `<tspan x="80" dy="${index ? 38 : 0}">${escapeXml(line)}</tspan>`)
    .join("");
  const compact = (values: string[]) => {
    const value = [...new Set(values)].slice(0, 4).join(" · ");
    return value.length > 86 ? `${value.slice(0, 83)}…` : value;
  };
  const readings = compact([...entry.syllabifications, ...entry.pronunciations]);
  const readingY = wordLines.length > 1 ? 355 : 344;
  const slug = params.slug ?? "";
  const fullDisplayUrl = `${new URL(SITE_URL).host}${sitePath(`/kata/${slug}/`)}`;
  const displayUrl =
    fullDisplayUrl.length > 60 ? `${fullDisplayUrl.slice(0, 57)}…` : fullDisplayUrl;
  const svg = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#fff"/>
      <rect x="0" y="0" width="24" height="630" fill="#000"/>
      <text x="80" y="94" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="4">TUTUR · KAMUS BAHASA INDONESIA</text>
      <line x1="80" y1="132" x2="1120" y2="132" stroke="#000" stroke-width="2"/>
      <text x="80" y="${wordY}" font-family="Inter, Arial, sans-serif" font-size="${wordSize}" font-weight="650" letter-spacing="-3">${word}</text>
      ${readings ? `<text x="80" y="${readingY}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500">${escapeXml(readings)}</text>` : ""}
      <text x="80" y="${hasReadings ? 415 : 400}" font-family="Inter, Arial, sans-serif" font-size="${hasReadings ? 27 : 30}" font-weight="400" fill="#333">${summary}</text>
      <text x="80" y="570" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600">${escapeXml(displayUrl)}</text>
      <image x="1044" y="510" width="76" height="76" href="${taratsaIcon}"/>
    </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      ETag: `"tutur-og-${entry.id}"`,
    },
  });
};
