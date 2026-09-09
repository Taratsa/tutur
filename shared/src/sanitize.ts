const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "sup", "sub", "br"]);

function decodeHtmlEntities(value: unknown): string {
  return String(value ?? "").replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu,
    (match, entity) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      if (lower === "nbsp") return " ";
      const codePoint = lower.startsWith("#x")
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return Number.isInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : match;
    },
  );
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeDefinition(value: unknown): string {
  const source = decodeHtmlEntities(value);
  const output: string[] = [];
  const openTags: string[] = [];
  let cursor = 0;

  for (const match of source.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/giu)) {
    const tag = match[1].toLowerCase();
    const start = match.index ?? 0;
    output.push(escapeHtml(source.slice(cursor, start)));
    if (ALLOWED_TAGS.has(tag)) {
      if (tag === "br") output.push("<br>");
      else if (match[0].startsWith("</")) {
        // Elemen fmt KBBI bisa tak berpasangan; penutup yatim ditutup sampai
        // tag pembuka terakhir yang cocok agar HTML tidak bocor keluar <div>.
        const openIndex = openTags.lastIndexOf(tag);
        if (openIndex !== -1) {
          while (openTags.length > openIndex) output.push(`</${openTags.pop()}>`);
        }
      } else {
        output.push(`<${tag}>`);
        openTags.push(tag);
      }
    }
    cursor = start + match[0].length;
  }

  output.push(escapeHtml(source.slice(cursor)));
  while (openTags.length) output.push(`</${openTags.pop()}>`);
  return output.join("");
}

export function definitionToText(value: unknown): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
}

// Makna KBBI VI (Definisi/kbbi) disimpan sebagai teks biasa: penomoran "1."
// memisahkan pengertian dalam satu string, tag sudut seperti <Pr> menandai
// bahasa sumber, dan penanda kelas seperti [n] dipertahankan apa adanya.
export function cleanMakna(value: unknown): string[] {
  const output: string[] = [];
  for (const rawLine of String(value ?? "").split(/\r?\n+/u)) {
    const startsNew = /^\s*\d+\.\s*/u.test(rawLine);
    const line = rawLine.replace(/^\s*\d+\.\s*/u, "").trim();
    if (!line) continue;
    if (startsNew || output.length === 0) output.push(line);
    else output[output.length - 1] += ` ${line}`;
  }
  return output
    .map((line) =>
      line
        .replace(/<([A-Za-z]+)>/gu, "($1)")
        .replace(/\s+/gu, " ")
        .replace(/\s*;\s*$/u, "")
        .trim(),
    )
    .filter(Boolean);
}

export function truncateText(value: unknown, maxLength = 220): string {
  const text = String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
