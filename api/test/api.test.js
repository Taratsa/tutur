import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { rm } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { buildDatabase } from "../src/database.js";

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
  },
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
