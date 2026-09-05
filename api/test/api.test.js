import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { rm } from "node:fs/promises";
import { createApp } from "../src/app.ts";
import { buildDatabase } from "../src/database.ts";

const fixture = {
  stats: {
    dictionaryRecords: 3,
    uniqueHeadwords: 3,
    slugCollisionCount: 0,
    bakuRecords: 1,
    sinonimRecords: 1,
    antonimRecords: 1,
    slangRecords: 1,
    enrichedWords: 1,
    extrasEntries: 1,
    familyRoots: 1,
    familyMembers: 1,
    etymologyRecords: 1,
    etymologyTerms: 1,
    etymologyLinkedTerms: 1,
    kaikkiRecords: 1,
    kaikkiTerms: 1,
    kaikkiEtymologyTerms: 1,
  },
  entries: [
    {
      id: 1,
      word: "sakola",
      normalizedWord: "sakola",
      slug: "sakola",
      letter: "s",
      definitions: [{ id: 3, type: 1, html: "<b>sakola</b>", text: "sistem pendidikan" }],
      frequency: null,
      root: null,
      rootRank: null,
      extras: null,
    },
    {
      id: 2,
      word: "bahasa",
      normalizedWord: "bahasa",
      slug: "bahasa",
      letter: "b",
      definitions: [{ id: 1, type: 1, html: "<b>bahasa</b>", text: "sistem lambang bunyi" }],
      frequency: 477569,
      root: "bahasa",
      rootRank: 9,
      rootFrequency: 500000,
      extras: {
        pronunciation: null,
        etymology: null,
        examples: [{ text: "sebuah -- yang kaya", slug: null }],
        derivations: [{ text: "berbahasa", slug: null }],
        compounds: [],
        proverbs: [],
        idioms: [],
      },
    },
    {
      id: 3,
      word: "bahasa-baku",
      normalizedWord: "bahasa-baku",
      slug: "bahasa-baku",
      letter: "b",
      definitions: [
        { id: 2, type: 1, html: "<b>bahasa-baku</b>", text: "bahasa yang sesuai kaidah" },
      ],
      frequency: 12,
      root: null,
      rootRank: null,
      extras: null,
    },
  ],
  relations: {
    baku: [
      {
        id: 1,
        word: "praktik",
        normalizedWord: "praktik",
        wrong: "praktek",
        normalizedWrong: "praktek",
        explanation: "bentuk baku",
        clue: null,
      },
    ],
    sinonim: [
      {
        id: 1,
        word: "bahasa",
        normalizedWord: "bahasa",
        wrong: "lingo",
        normalizedWrong: "lingo",
        type: "synset",
        explanation: "padanan",
        usageA: "contoh",
        usageB: "contoh",
      },
    ],
    antonim: [
      {
        id: 1,
        word: "baik",
        normalizedWord: "baik",
        wrong: "buruk",
        normalizedWrong: "buruk",
        oppositionType: "gradabel",
        field: "umum",
        confidence: "tinggi",
        explanation: "lawan",
        usageA: "contoh",
        usageB: "contoh",
        note: null,
      },
    ],
    slang: [
      {
        id: 1,
        slang: "bhasa",
        normalizedSlang: "bhasa",
        formal: "bahasa",
        normalizedFormal: "bahasa",
        inDictionary: true,
        categories: ["abreviasi"],
      },
    ],
    etymology: [
      {
        id: 1,
        termId: "bahasa-term",
        lang: "Indonesian",
        term: "bahasa",
        normalizedTerm: "bahasa",
        relationType: "inherited_from",
        relatedTermId: "melayu-term",
        relatedLang: "Malay",
        relatedTerm: "bahasa",
        position: 0,
        groupTag: null,
        parentTag: null,
        parentPosition: null,
      },
    ],
  },
  kaikki: [
    {
      id: 1,
      word: "bahasa",
      normalizedWord: "bahasa",
      partOfSpeech: "Nomina",
      etymology: "Inherited from Malay bahasa.",
      pronunciations: ["/baˈhasa/"],
      forms: [{ text: "bahasa-bahasa", tags: ["plural"] }],
      derived: ["berbahasa"],
      synonyms: ["tuturan"],
    },
  ],
  families: [
    {
      root: "bahasa",
      rootSlug: "bahasa",
      members: [{ text: "berbahasa", slug: null, frequency: 999 }],
    },
  ],
};

let db;
let app;
let databasePath;
afterEach(async () => {
  db?.close();
  if (databasePath) await rm(databasePath, { force: true });
});

function setup(env = { RATE_LIMIT_PER_MINUTE: "120", CORS_ORIGIN: "http://localhost:4321" }) {
  databasePath = `/tmp/tutur-search-fixture-${process.pid}-${Math.random().toString(16).slice(2)}.sqlite`;
  buildDatabase(fixture, databasePath);
  db = new Database(databasePath, { readonly: true });
  app = createApp({ db, env });
}

test("exact, prefix, and relation searches return canonical URLs", async () => {
  setup();
  expect(db.query("SELECT COUNT(*) AS count FROM entries").get().count).toBe(3);
  expect(db.query("SELECT COUNT(*) AS count FROM definitions").get().count).toBe(3);
  expect(db.query("SELECT frequency FROM entries WHERE slug = 'bahasa'").get().frequency).toBe(
    477569,
  );
  expect(db.query("SELECT COUNT(*) AS count FROM entry_extras").get().count).toBe(1);
  expect(db.query("SELECT COUNT(*) AS count FROM etymology_relations").get().count).toBe(1);
  expect(db.query("SELECT COUNT(*) AS count FROM kaikki_entries").get().count).toBe(1);
  expect(
    db
      .query(
        "SELECT part_of_speech, etymology, forms FROM kaikki_entries WHERE normalized_word = 'bahasa'",
      )
      .get(),
  ).toEqual({
    part_of_speech: "Nomina",
    etymology: "Inherited from Malay bahasa.",
    forms: JSON.stringify([{ text: "bahasa-bahasa", tags: ["plural"] }]),
  });
  expect(
    db
      .query(
        "SELECT relation_type, related_lang, related_term FROM etymology_relations WHERE normalized_term = 'bahasa'",
      )
      .get(),
  ).toEqual({
    relation_type: "inherited_from",
    related_lang: "Malay",
    related_term: "bahasa",
  });
  expect(db.query("SELECT COUNT(*) AS count FROM word_families").get().count).toBe(1);
  expect(db.query("SELECT COUNT(*) AS count FROM slang_relations").get().count).toBe(1);
  const exact = await app.request("http://localhost/api/search?q=bahasa&limit=20");
  expect(exact.status).toBe(200);
  const exactJson = await exact.json();
  expect(exactJson.results[0]).toMatchObject({
    type: "dictionary",
    slug: "bahasa",
    url: "/kata/bahasa/",
  });

  const prefix = await app.request("http://localhost/api/search?q=bahasa-b&limit=20");
  expect(prefix.status).toBe(200);
  expect((await prefix.json()).results[0].slug).toBe("bahasa-baku");

  const relation = await app.request("http://localhost/api/search?q=praktek&type=baku");
  expect(relation.status).toBe(200);
  expect((await relation.json()).results[0]).toMatchObject({
    type: "baku",
    word: "praktik",
    counterpart: "praktek",
  });
});

test("slang queries map to their formal entries", async () => {
  setup();
  const slang = await app.request("http://localhost/api/search?q=bhasa&type=slang");
  expect(slang.status).toBe(200);
  expect((await slang.json()).results[0]).toMatchObject({
    type: "slang",
    word: "bhasa",
    counterpart: "bahasa",
    url: "/kata/bahasa/",
  });
  const all = await app.request("http://localhost/api/search?q=bhasa");
  expect((await all.json()).results[0].type).toBe("slang");
});

test("equal-rank results are ordered by corpus frequency", async () => {
  setup();
  const ranked = await app.request("http://localhost/api/search?q=sistem");
  const results = (await ranked.json()).results;
  expect(results[0]).toMatchObject({ type: "dictionary", slug: "bahasa" });
  expect(results[0].slug).not.toBe("sakola");
});

test("whole-token and FTS substring paths preserve ranking", async () => {
  setup();
  const wholeToken = await app.request("http://localhost/api/search?q=sistem");
  expect((await wholeToken.json()).results[0]).toMatchObject({
    type: "dictionary",
    slug: "bahasa",
  });
  const substring = await app.request("http://localhost/api/search?q=hasa");
  expect((await substring.json()).results[0]).toMatchObject({ type: "dictionary", slug: "bahasa" });
  const ranked = await app.request("http://localhost/api/search?q=bahasa&limit=2");
  expect((await ranked.json()).results[0].slug).toBe("bahasa");
});

test("short queries use the bounded LIKE scan instead of trigram FTS", async () => {
  setup({ RATE_LIMIT_PER_MINUTE: "1000", SEARCH_CACHE_TTL: "0" });
  const twoChar = await app.request("http://localhost/api/search?q=ba");
  expect(twoChar.status).toBe(200);
  expect((await twoChar.json()).results[0]).toMatchObject({ type: "dictionary", slug: "bahasa" });
  const threeChar = await app.request("http://localhost/api/search?q=has");
  expect(threeChar.status).toBe(200);
  expect((await threeChar.json()).results[0]).toMatchObject({ type: "dictionary", slug: "bahasa" });
});

test("exact match that fills the limit skips later strategies", async () => {
  setup({ RATE_LIMIT_PER_MINUTE: "1000", SEARCH_CACHE_TTL: "0" });
  const limited = await app.request("http://localhost/api/search?q=bahasa&limit=1");
  expect(limited.status).toBe(200);
  const results = (await limited.json()).results;
  expect(results.length).toBe(1);
  expect(results[0]).toMatchObject({ type: "dictionary", slug: "bahasa" });
});

test("cached responses serve ETag/304, skip SQL on hit, and re-execute after expiry", async () => {
  databasePath = `/tmp/tutur-search-fixture-${process.pid}-${Math.random().toString(16).slice(2)}.sqlite`;
  buildDatabase(fixture, databasePath);
  db = new Database(databasePath, { readonly: true });
  let queryCount = 0;
  const countingDb = new Proxy(db, {
    get(target, prop) {
      if (prop === "query") {
        return (...args) => {
          queryCount += 1;
          return target.query(...args);
        };
      }
      return target[prop];
    },
  });
  let clock = 1_000_000;
  const cachedApp = createApp({
    db: countingDb,
    env: { RATE_LIMIT_PER_MINUTE: "1000", SEARCH_CACHE_TTL: "60000" },
    now: () => clock,
  });

  const first = await cachedApp.request("http://localhost/api/search?q=bahasa");
  expect(first.status).toBe(200);
  const etag = first.headers.get("etag");
  expect(etag).toBeTruthy();
  const payload = await first.text();
  const queriesAfterFirst = queryCount;

  const revalidated = await cachedApp.request("http://localhost/api/search?q=bahasa", {
    headers: { "if-none-match": etag },
  });
  expect(revalidated.status).toBe(304);
  expect(revalidated.headers.get("cache-control")).toContain("max-age=60");
  expect(queryCount).toBe(queriesAfterFirst);

  clock += 61_000;
  const expired = await cachedApp.request("http://localhost/api/search?q=bahasa", {
    headers: { "if-none-match": etag },
  });
  expect(queryCount).toBeGreaterThan(queriesAfterFirst);
  expect(expired.status).toBe(304);
  expect(await expired.text()).toBe("");
});

test("SEARCH_CACHE_TTL=0 re-executes the search on every request", async () => {
  databasePath = `/tmp/tutur-search-fixture-${process.pid}-${Math.random().toString(16).slice(2)}.sqlite`;
  buildDatabase(fixture, databasePath);
  db = new Database(databasePath, { readonly: true });
  let queryCount = 0;
  const countingDb = new Proxy(db, {
    get(target, prop) {
      if (prop === "query") {
        return (...args) => {
          queryCount += 1;
          return target.query(...args);
        };
      }
      return target[prop];
    },
  });
  const uncachedApp = createApp({
    db: countingDb,
    env: { RATE_LIMIT_PER_MINUTE: "1000", SEARCH_CACHE_TTL: "0" },
  });

  const first = await uncachedApp.request("http://localhost/api/search?q=bahasa");
  expect(first.status).toBe(200);
  await first.text();
  const queriesAfterFirst = queryCount;

  const second = await uncachedApp.request("http://localhost/api/search?q=bahasa");
  expect(second.status).toBe(200);
  await second.text();
  expect(queryCount).toBeGreaterThan(queriesAfterFirst);
});

test("x-forwarded-for is only trusted when TRUST_PROXY=1", async () => {
  setup({ RATE_LIMIT_PER_MINUTE: "1", CORS_ORIGIN: "http://localhost:4321" });
  const headers = { "x-forwarded-for": "203.0.113.10" };
  // Tanpa TRUST_PROXY, semua klien berbagi bucket "local" → permintaan kedua 429.
  expect((await app.request("http://localhost/api/search?q=bahasa", { headers })).status).toBe(200);
  expect((await app.request("http://localhost/api/search?q=bahasa", { headers })).status).toBe(429);

  const proxied = createApp({
    db,
    env: {
      RATE_LIMIT_PER_MINUTE: "1",
      CORS_ORIGIN: "http://localhost:4321",
      TRUST_PROXY: "1",
    },
  });
  const first = await proxied.request("http://localhost/api/search?q=bahasa", { headers });
  expect(first.status).toBe(200);
  const second = await proxied.request("http://localhost/api/search?q=bahasa", { headers });
  expect(second.status).toBe(429);
  const otherClient = await proxied.request("http://localhost/api/search?q=bahasa", {
    headers: { "x-forwarded-for": "198.51.100.7" },
  });
  expect(otherClient.status).toBe(200);
});

test("validation, 404, and rate limiting are explicit", async () => {
  setup({ RATE_LIMIT_PER_MINUTE: "1", CORS_ORIGIN: "http://localhost:4321" });
  expect((await app.request("http://localhost/api/search?q=a")).status).toBe(400);
  expect((await app.request("http://localhost/api/search?q=bahasa&limit=51")).status).toBe(400);
  expect((await app.request(`http://localhost/api/search?q=${"x".repeat(81)}`)).status).toBe(400);
  expect((await app.request("http://localhost/api/search?q=bahasa&type=unknown")).status).toBe(400);
  expect((await app.request("http://localhost/missing")).status).toBe(404);
  expect((await app.request("http://localhost/api/search?q=bahasa")).status).toBe(200);
  expect((await app.request("http://localhost/api/search?q=bahasa")).status).toBe(429);
});

test("database failures return a 500 response", async () => {
  const broken = createApp({
    db: {
      query() {
        throw new Error("database unavailable");
      },
    },
  });
  expect((await broken.request("http://localhost/api/search?q=bahasa")).status).toBe(500);
});

test("CORS is limited to configured origins", async () => {
  setup();
  const allowed = await app.request("http://localhost/health", {
    headers: { Origin: "http://localhost:4321" },
  });
  expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:4321");
  const denied = await app.request("http://localhost/health", {
    headers: { Origin: "https://other.example" },
  });
  expect(denied.headers.get("access-control-allow-origin")).toBeNull();
});
