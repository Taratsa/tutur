import { gzipSync } from "node:zlib";
import { join, relative, resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

const root = resolve(new URL("../", import.meta.url).pathname);
const output = join(root, "ui", "dist");
const client = join(output, "client");
const data = JSON.parse(await readFile(join(root, "build", "data", "site.json"), "utf8"));

async function walk(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const files = await walk(output);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const clientHtmlFiles = htmlFiles.filter((file) => file.startsWith(`${client}/`));
const wordFiles = clientHtmlFiles.filter((file) => relative(client, file).startsWith("kata/"));
const slugs = new Set();
for (const entry of data.entries) {
  if (!entry.slug || slugs.has(entry.slug))
    throw new Error(`Duplicate or unsafe word slug: ${entry.slug}`);
  slugs.add(entry.slug);
}
if (wordFiles.length)
  throw new Error(`SSR build unexpectedly emitted ${wordFiles.length} word HTML files`);
if (!files.includes(join(output, "server", "entry.mjs")))
  throw new Error("SSR server entry is missing");
const wordSource = await readFile(join(root, "ui", "src/pages/kata/[slug].astro"), "utf8");
if (!wordSource.includes("getWordPage") || !wordSource.includes("prerender = false"))
  throw new Error("Word route is not configured for SSR");

const canonicalUrls = new Map();
let totalHtmlBytes = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  totalHtmlBytes += Buffer.byteLength(html);
  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/u)?.[1];
  if (canonical) {
    const previous = canonicalUrls.get(canonical);
    if (previous) throw new Error(`Duplicate canonical ${canonical}: ${previous} and ${file}`);
    canonicalUrls.set(canonical, file);
  }
}

const searchHtml = join(client, "search", "index.html");
if (!(await stat(searchHtml).catch(() => null)))
  throw new Error("Static search document is missing");
if (!/name="robots" content="noindex, follow"/u.test(await readFile(searchHtml, "utf8")))
  throw new Error("Search page must be noindex,follow");

const clientAssets = files.filter((file) => file.startsWith(`${client}/_astro/`));
const js = clientAssets.filter((file) => file.endsWith(".js"));
const css = clientAssets.filter((file) => file.endsWith(".css"));
const bytesFor = async (file) => (await stat(file)).size;
const compressedFor = async (file) => gzipSync(await readFile(file)).byteLength;
const outputBytes = (await Promise.all(files.map(bytesFor))).reduce((sum, value) => sum + value, 0);
const compressedBytes = (await Promise.all(files.map(compressedFor))).reduce(
  (sum, value) => sum + value,
  0,
);
const javascriptBundles = await Promise.all(
  js.map(async (file) => ({
    file: relative(output, file),
    bytes: await bytesFor(file),
    gzipBytes: await compressedFor(file),
  })),
);
const cssBundles = await Promise.all(
  css.map(async (file) => ({
    file: relative(output, file),
    bytes: await bytesFor(file),
    gzipBytes: await compressedFor(file),
  })),
);
const largestJsGzip = Math.max(0, ...javascriptBundles.map((bundle) => bundle.gzipBytes));
const largestCssGzip = Math.max(0, ...cssBundles.map((bundle) => bundle.gzipBytes));
const metrics = {
  rendering: "ssr",
  ssrWordRoutes: data.stats.uniqueHeadwords,
  generatedWordPages: wordFiles.length,
  uniqueHeadwords: data.stats.uniqueHeadwords,
  duplicateRecords: data.stats.duplicateRecords,
  slugCollisionCount: data.stats.slugCollisionCount,
  outputBytes,
  outputMegabytes: Number((outputBytes / 1024 / 1024).toFixed(2)),
  compressedArtifactBytes: compressedBytes,
  compressedArtifactMegabytes: Number((compressedBytes / 1024 / 1024).toFixed(2)),
  htmlBytes: totalHtmlBytes,
  staticHtmlPages: clientHtmlFiles.length,
  averageWordPageBytes: null,
  maximumWordPageBytes: null,
  javascriptBundles,
  cssBundles,
  largestJavascriptGzipBytes: largestJsGzip,
  largestCssGzipBytes: largestCssGzip,
  sitemapFilesInOutput: files
    .filter((file) => /sitemap.*\.xml$/u.test(file))
    .map((file) => relative(output, file)),
  canonicalCount: canonicalUrls.size,
  serverEntryBytes: await bytesFor(join(output, "server", "entry.mjs")),
};
if (outputBytes > 700 * 1024 * 1024)
  throw new Error(`Published output exceeds 700 MB: ${metrics.outputMegabytes} MB`);
if (largestJsGzip > 100 * 1024)
  console.warn(`WARN JavaScript bundle exceeds 100 KB gzip: ${largestJsGzip}`);
console.log(`OUTPUT_METRICS ${JSON.stringify(metrics)}`);
