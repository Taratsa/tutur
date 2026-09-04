import { cors } from "hono/cors";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { createSearcher, SearchInputError, validateSearchParams } from "./search.js";

const SEARCH_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

function allowedOrigins(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function clientKey(c, trustProxy) {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const cfIp = c.req.header("cf-connecting-ip");
    if (cfIp) return cfIp;
  }
  return "local";
}

function readCount(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
}

export function createApp({ db, env = process.env, now = () => Date.now() } = {}) {
  if (!db) throw new Error("A read-only SQLite database is required");
  const app = new Hono();
  const { searchPrepared } = createSearcher(db);
  const origins = allowedOrigins(env.CORS_ORIGIN);
  const trustProxy = env.TRUST_PROXY === "1";
  const windowMs = 60_000;
  const rateLimit = Math.max(1, Number.parseInt(env.RATE_LIMIT_PER_MINUTE ?? "120", 10) || 120);
  const clientEvictionThreshold = Math.max(rateLimit * 4, 4096);
  const clients = new Map();

  // Cache respons dalam proses: hanya 200, dibatasi SEARCH_CACHE_MAX entri
  // (LRU), kedaluwarsa setelah SEARCH_CACHE_TTL milidetik, dan bisa dimatikan
  // dengan SEARCH_CACHE_TTL=0.
  const cacheTtl = readCount(env.SEARCH_CACHE_TTL, 60_000);
  const cacheMax = readCount(env.SEARCH_CACHE_MAX, 2048);
  const cache = new Map();

  function lookupCache(key, timestamp) {
    if (cacheTtl <= 0 || cacheMax <= 0) return null;
    const hit = cache.get(key);
    if (!hit) return null;
    if (timestamp - hit.storedAt >= cacheTtl) {
      cache.delete(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  function storeCache(key, entry, timestamp) {
    if (cacheTtl <= 0 || cacheMax <= 0) return;
    entry.storedAt = timestamp;
    cache.set(key, entry);
    if (cache.size > cacheMax) cache.delete(cache.keys().next().value);
  }

  app.use("*", compress());
  app.use("*", cors({ origin: (origin) => (origins.has(origin) ? origin : "") }));

  app.get("/health", (c) => c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" }));
  app.get("/api/search", (c) => {
    let query;
    try {
      query = validateSearchParams(c.req.query());
    } catch (error) {
      if (error instanceof SearchInputError) return jsonError(c, 400, error.message);
      throw error;
    }
    const timestamp = now();
    const client = clientKey(c, trustProxy);
    const window = clients.get(client);
    if (!window || timestamp - window.startedAt >= windowMs) {
      // Jendela yang sudah lewat tidak pernah bisa aktif lagi, jadi sebelum
      // peta tumbuh tanpa batas, buang entri yang kedaluwarsa.
      if (clients.size >= clientEvictionThreshold) {
        for (const [key, entry] of clients) {
          if (timestamp - entry.startedAt >= windowMs) clients.delete(key);
        }
      }
      clients.set(client, { startedAt: timestamp, count: 1 });
    } else if (window.count >= rateLimit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (timestamp - window.startedAt)) / 1000));
      return jsonError(c, 429, "Terlalu banyak permintaan. Coba lagi sebentar.", {
        "Retry-After": String(retryAfter),
      });
    } else {
      window.count += 1;
    }

    const cacheKey = `${query.query}\u0000${query.type}\u0000${query.limit}`;
    const cacheHit = lookupCache(cacheKey, timestamp);
    if (cacheHit) {
      if (c.req.header("if-none-match") === cacheHit.etag) {
        return c.body(null, 304, { ETag: cacheHit.etag, "Cache-Control": SEARCH_CACHE_CONTROL });
      }
      return c.body(cacheHit.payload, 200, {
        "Content-Type": "application/json; charset=UTF-8",
        ETag: cacheHit.etag,
        "Cache-Control": SEARCH_CACHE_CONTROL,
      });
    }

    let payload;
    let etag;
    try {
      const results = searchPrepared(query);
      payload = JSON.stringify({ query: query.query, results });
      etag = `W/"${Bun.hash(payload).toString(36)}"`;
    } catch (error) {
      if (error instanceof SearchInputError) return jsonError(c, 400, error.message);
      console.error(error);
      return jsonError(c, 500, "Pencarian sedang tidak tersedia.");
    }
    storeCache(cacheKey, { payload, etag }, timestamp);

    if (c.req.header("if-none-match") === etag) {
      return c.body(null, 304, { ETag: etag, "Cache-Control": SEARCH_CACHE_CONTROL });
    }
    return c.body(payload, 200, {
      "Content-Type": "application/json; charset=UTF-8",
      ETag: etag,
      "Cache-Control": SEARCH_CACHE_CONTROL,
    });
  });

  app.notFound((c) => jsonError(c, 404, "Not found"));
  app.onError((error, c) => {
    console.error(error);
    return jsonError(c, 500, "Pencarian sedang tidak tersedia.");
  });
  return app;
}

function jsonError(c, status, error, headers = {}) {
  return c.json({ error }, status, headers);
}
