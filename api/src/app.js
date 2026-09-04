import { cors } from "hono/cors";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { createSearcher, SearchInputError, validateSearchParams } from "./search.js";

function allowedOrigins(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function jsonError(c, status, error, headers = {}) {
  return c.json({ error }, status, headers);
}

export function createApp({ db, env = process.env, now = () => Date.now() } = {}) {
  if (!db) throw new Error("A read-only SQLite database is required");
  const app = new Hono();
  const search = createSearcher(db);
  const origins = allowedOrigins(env.CORS_ORIGIN);
  const windowMs = 60_000;
  const rateLimit = Math.max(1, Number.parseInt(env.RATE_LIMIT_PER_MINUTE ?? "120", 10) || 120);
  const clients = new Map();

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
    const client =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "local";
    const timestamp = now();
    const window = clients.get(client);
    if (!window || timestamp - window.startedAt >= windowMs) {
      clients.set(client, { startedAt: timestamp, count: 1 });
    } else if (window.count >= rateLimit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (timestamp - window.startedAt)) / 1000));
      return jsonError(c, 429, "Terlalu banyak permintaan. Coba lagi sebentar.", {
        "Retry-After": String(retryAfter),
      });
    } else {
      window.count += 1;
    }

    try {
      const results = search(c.req.query());
      return c.json({ query: query.query, results }, 200, {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      });
    } catch (error) {
      if (error instanceof SearchInputError) return jsonError(c, 400, error.message);
      console.error(error);
      return jsonError(c, 500, "Pencarian sedang tidak tersedia.");
    }
  });

  app.notFound((c) => jsonError(c, 404, "Not found"));
  app.onError((error, c) => {
    console.error(error);
    return jsonError(c, 500, "Internal server error");
  });
  return app;
}
