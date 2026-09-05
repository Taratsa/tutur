import { Database } from "bun:sqlite";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const root = resolve(new URL("../", import.meta.url).pathname);
const uiDirectory = join(root, "ui");
const port = Number(process.env.SSR_TEST_PORT ?? 43921);
const base = (process.env.BASE_PATH || "/").replace(/\/+$/u, "");
const origin = `http://127.0.0.1:${port}`;
const requestPath = (path) => `${origin}${base}${path === "/" ? "/" : path}`;
const data = JSON.parse(await readFile(join(root, "build", "data", "site.json"), "utf8"));
const db = new Database(resolve(root, process.env.SEARCH_DB_PATH ?? "api/data/search.sqlite"), {
  readonly: true,
  create: false,
});
const dbSlugs = new Set(
  db
    .query("SELECT slug FROM entries")
    .all()
    .map((row) => row.slug),
);
db.close();

if (
  dbSlugs.size !== data.stats.uniqueHeadwords ||
  [...data.entries].some((entry) => !dbSlugs.has(entry.slug))
) {
  throw new Error("SSR database and prepared word routes do not contain the same slugs");
}

const child = Bun.spawn(["bun", "dist/server/entry.mjs"], {
  cwd: uiDirectory,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    SEARCH_DB_PATH: process.env.SEARCH_DB_PATH ?? "../api/data/search.sqlite",
  },
  stdout: "ignore",
  stderr: "ignore",
});

async function get(path) {
  return fetch(requestPath(path), { redirect: "manual" });
}

let wordResponse;
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      wordResponse = await get("/kata/bahasa/");
      break;
    } catch {
      await Bun.sleep(100);
    }
  }
  if (!wordResponse) throw new Error("SSR server did not start");
  const wordHtml = await wordResponse.text();
  // Definisi tetap terbaca penuh tanpa JavaScript. Island graf kata boleh
  // di-hydrate, tetapi island pencarian (bundle terberat) tidak boleh ikut.
  if (
    wordResponse.status !== 200 ||
    !/<html lang="id">/u.test(wordHtml) ||
    !/<title>Arti kata bahasa/u.test(wordHtml) ||
    !/<meta name="description" content="[^"]+"/u.test(wordHtml) ||
    !/<link rel="canonical" href="[^"]+\/kata\/bahasa\//u.test(wordHtml) ||
    (wordHtml.match(/<h1>/gu) || []).length !== 1 ||
    !/<h1>bahasa<\/h1>/u.test(wordHtml) ||
    !/<ol class="definitions">[\s\S]*<li>/u.test(wordHtml) ||
    /SearchIsland/u.test(wordHtml) ||
    (wordHtml.match(/<script[^>]+type="module"/gu) || []).length > 1
  ) {
    throw new Error(
      "Representative SSR word page is missing SEO, definition, or JS-disabled content",
    );
  }
  if (!wordResponse.headers.get("cache-control")?.includes("s-maxage=604800"))
    throw new Error("Word response is missing its shared-cache policy");

  const enriched = await get("/kata/abu/");
  const enrichedHtml = await enriched.text();
  if (
    enriched.status !== 200 ||
    !/Frekuensi korpus/u.test(enrichedHtml) ||
    !/Keluarga kata/u.test(enrichedHtml) ||
    !/Contoh penggunaan/u.test(enrichedHtml) ||
    !/Peribahasa dan kiasan/u.test(enrichedHtml) ||
    !/Gabungan kata/u.test(enrichedHtml)
  )
    throw new Error(
      "Enriched word page is missing corpus frequency, family, or v6 extras sections",
    );

  const etymology = await get("/kata/adat/");
  const etymologyHtml = await etymology.text();
  if (
    etymology.status !== 200 ||
    !/<h2 id="etymology-title">Etimologi<\/h2>/u.test(etymologyHtml) ||
    !/Wiktionary/u.test(etymologyHtml) ||
    !/Berakar pada/u.test(etymologyHtml) ||
    !/<h2 id="kaikki-title">Data leksikal<\/h2>/u.test(etymologyHtml) ||
    !/Wiktextract/u.test(etymologyHtml) ||
    !/IPA:/u.test(etymologyHtml)
  )
    throw new Error("Etymology word page is missing structured source relations or Kaikki data");

  const kaikki = await get("/kata/tesaurus/");
  const kaikkiHtml = await kaikki.text();
  if (
    kaikki.status !== 200 ||
    !/<h2 id="kaikki-title">Data leksikal<\/h2>/u.test(kaikkiHtml) ||
    !/Borrowed from Dutch thesaurus/u.test(kaikkiHtml) ||
    !/IPA:/u.test(kaikkiHtml)
  )
    throw new Error("Kaikki enrichment is missing from the tesaurus word page");

  const slangPage = await get("/kata/banget/");
  const slangHtml = await slangPage.text();
  if (slangPage.status !== 200 || !/Bentuk slang/u.test(slangHtml) || !/>bgt</u.test(slangHtml))
    throw new Error("Slang-aware word page is missing its slang form section");

  const populer = await get("/populer/");
  const populerHtml = await populer.text();
  if (
    populer.status !== 200 ||
    !/Kata paling sering dipakai/u.test(populerHtml) ||
    (populerHtml.match(/href="[^"]*\/kata\//gu) || []).length < 50
  )
    throw new Error("Popular words page is missing its ranked word list");

  const missing = await get("/kata/not-a-real-kbbi-slug/");
  if (missing.status !== 404)
    throw new Error(`Unknown word returned ${missing.status} instead of 404`);
  const alphabet = await get("/huruf/a/");
  if (alphabet.status !== 200 || !/<ol class="alphabet-word-list">/u.test(await alphabet.text()))
    throw new Error("Alphabet SSR page failed");
  const firstPage = await get("/huruf/a/1/");
  if (
    ![301, 308].includes(firstPage.status) ||
    !firstPage.headers.get("location")?.endsWith("/huruf/a/")
  )
    throw new Error("Duplicate first alphabet URL was not redirected");
  const uppercaseLetter = await get("/huruf/A/");
  if (
    ![301, 308].includes(uppercaseLetter.status) ||
    !uppercaseLetter.headers.get("location")?.endsWith("/huruf/a/")
  )
    throw new Error("Uppercase alphabet URL was not redirected");

  const sitemapIndexResponse = await get("/sitemap-index.xml");
  const sitemapIndex = await sitemapIndexResponse.text();
  if (sitemapIndexResponse.status !== 200) throw new Error("Sitemap index failed");
  const locations = (source) =>
    [...source.matchAll(/<loc>(.*?)<\/loc>/gu)].map((match) =>
      match[1].replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"),
    );
  const sitemapLocations = locations(sitemapIndex);
  const wordSitemapLocations = new Set();
  let sitemapUrlCount = 0;
  for (const location of sitemapLocations) {
    const path = new URL(location).pathname;
    const response = await get(path);
    const body = await response.text();
    if (response.status !== 200) throw new Error(`Sitemap URL did not resolve: ${path}`);
    const urls = locations(body);
    if (urls.length > 50_000 || Buffer.byteLength(body) > 50 * 1024 * 1024)
      throw new Error(`Sitemap exceeds protocol limits: ${path}`);
    sitemapUrlCount += urls.length;
    if (path.includes("sitemap-words/"))
      for (const url of urls) wordSitemapLocations.add(new URL(url).pathname);
  }
  const expectedWordLocations = new Set(data.entries.map((entry) => `${base}/kata/${entry.slug}/`));
  if (
    wordSitemapLocations.size !== expectedWordLocations.size ||
    [...expectedWordLocations].some((url) => !wordSitemapLocations.has(url))
  )
    throw new Error("Word sitemap coverage does not match the SQLite word set");
  console.log(
    `SSR_METRICS ${JSON.stringify({
      wordRoutes: data.stats.uniqueHeadwords,
      representativeWordHtmlBytes: Buffer.byteLength(wordHtml),
      representativeWordJavaScriptModules: (wordHtml.match(/<script[^>]+type="module"/gu) || [])
        .length,
      sitemapCount: sitemapLocations.length,
      sitemapUrlCount,
    })}`,
  );
} finally {
  child.kill();
  await child.exited;
}
