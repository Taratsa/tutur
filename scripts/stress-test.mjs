// Closed-loop HTTP load generator for the search API and SSR UI.
// Usage: bun scripts/stress-test.mjs --base http://127.0.0.1:3002 --scenario mixed --concurrency 100 --duration 15
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : fallback;
}

const base = (arg("base", "http://127.0.0.1:3001") ?? "").replace(/\/+$/u, "");
const scenario = arg("scenario", "mixed");
const concurrency = Math.max(1, Number(arg("concurrency", 25)));
const durationSec = Math.max(1, Number(arg("duration", 15)));
const name = arg("name", `${scenario} c=${concurrency}`);

const root = resolve(new URL("../", import.meta.url).pathname);
const db = new Database(resolve(root, "api/data/search.sqlite"), { readonly: true });
const slugs = db
  .query("SELECT slug FROM entries ORDER BY frequency DESC LIMIT 800")
  .all()
  .map((row) => row.slug);
const words = db
  .query(
    "SELECT word FROM entries WHERE length(word) BETWEEN 5 AND 12 ORDER BY frequency DESC LIMIT 800",
  )
  .all()
  .map((row) => row.word);
const slang = db
  .query("SELECT slang FROM slang_relations LIMIT 400")
  .all()
  .map((r) => r.slang);
db.close();
if (slugs.length === 0 || words.length === 0) throw new Error("slug/word pool is empty");

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const infixes = ["nya", "kan", "ana", "sana", "ikat", "urang"];
const unknowns = ["zzqx", "wxqv", "kqxz"];

function nextRequest() {
  switch (scenario) {
    case "health":
      return "/health";
    case "exact":
      return `/api/search?q=${encodeURIComponent(pick(words))}&limit=20`;
    case "slang":
      return `/api/search?q=${encodeURIComponent(pick(slang))}&type=slang&limit=20`;
    case "prefix":
      return `/api/search?q=${pick(words).slice(0, 3)}&limit=20`;
    case "ftsWithin":
      return `/api/search?q=${pick(infixes)}&limit=20`;
    case "unknown":
      return `/api/search?q=${pick(unknowns)}&limit=20`;
    case "mixed": {
      const roll = Math.random();
      if (roll < 0.55) return `/api/search?q=${encodeURIComponent(pick(words))}&limit=20`;
      if (roll < 0.75) return `/api/search?q=${pick(words).slice(0, 3)}&limit=20`;
      if (roll < 0.9) return `/api/search?q=${pick(infixes)}&limit=20`;
      if (roll < 0.97)
        return `/api/search?q=${encodeURIComponent(pick(slang))}&type=slang&limit=20`;
      return `/api/search?q=${pick(unknowns)}&limit=20`;
    }
    case "word":
      return `/kata/${pick(slugs)}/`;
    case "alphabet":
      return "/huruf/a/";
    case "home":
      return "/";
    default:
      throw new Error(`unknown scenario: ${scenario}`);
  }
}

const deadline = Date.now() + durationSec * 1000;
const latencies = [];
const statuses = new Map();
let errors = 0;
let inFlight = concurrency;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    let status = 0;
    try {
      const response = await fetch(base + nextRequest(), {
        headers: { "accept-encoding": "gzip, br" },
      });
      status = response.status;
      await response.text();
    } catch {
      status = 0;
    }
    const elapsed = performance.now() - started;
    latencies.push(elapsed);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    if (status === 0) errors += 1;
  }
  inFlight -= 1;
}

const wallStarted = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const wallSec = (performance.now() - wallStarted) / 1000;

latencies.sort((a, b) => a - b);
const percentile = (p) =>
  latencies.length
    ? Math.round(
        latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))],
      )
    : 0;
const summary = {
  name,
  requests: latencies.length,
  rps: Number((latencies.length / wallSec).toFixed(1)),
  concurrency,
  durationSec,
  p50: percentile(50),
  p90: percentile(90),
  p99: percentile(99),
  max: latencies.length ? Math.round(latencies[latencies.length - 1]) : 0,
  statuses: Object.fromEntries([...statuses.entries()].sort()),
  connectionErrors: errors,
};
console.log(`STRESS ${JSON.stringify(summary)}`);
