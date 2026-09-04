import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { openReadOnlyDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";

const databasePath = resolve(process.cwd(), process.env.SEARCH_DB_PATH ?? "data/search.sqlite");
const db = openReadOnlyDatabase(databasePath);
const app = createApp({
  db,
  // Cache dimatikan agar benchmark mengukur eksekusi pencarian, bukan hit cache.
  env: {
    CORS_ORIGIN: "http://localhost:4321",
    RATE_LIMIT_PER_MINUTE: "1000",
    SEARCH_CACHE_TTL: "0",
  },
});
const queries = ["bahasa", "komputer", "tanggung", "xyz"];
const samples = [];
const responseBytes = [];

for (let index = 0; index < 100; index += 1) {
  const query = queries[index % queries.length];
  const started = performance.now();
  const response = await app.request(
    `http://localhost/api/search?q=${encodeURIComponent(query)}&limit=20`,
  );
  const body = await response.text();
  samples.push(performance.now() - started);
  responseBytes.push(Buffer.byteLength(body));
  if (response.status !== 200) throw new Error(`Unexpected benchmark response: ${response.status}`);
}

samples.sort((left, right) => left - right);
const percentile = (value) =>
  samples[Math.min(samples.length - 1, Math.floor(samples.length * value))];
console.log(
  `API_BENCHMARK ${JSON.stringify({
    requests: samples.length,
    medianMs: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    maxMs: Number(samples.at(-1).toFixed(2)),
    maxResponseBytes: Math.max(...responseBytes),
  })}`,
);
db.close();
