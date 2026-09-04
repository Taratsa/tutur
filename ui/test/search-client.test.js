import { expect, test } from "bun:test";
import { createSearchClient } from "../src/lib/search-client.js";

test("a newer search cancels and wins over an obsolete request", async () => {
  const pending = [];
  const client = createSearchClient({
    endpoint: "http://localhost:3001/api/search",
    fetchImpl: (url, options) =>
      new Promise((resolve, reject) => {
        pending.push({
          query: new URL(url).searchParams.get("q"),
          resolve,
          reject,
          signal: options.signal,
        });
        options.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  });

  const first = client.search("ba", "all");
  const second = client.search("bah", "all");
  pending[1].resolve(new Response(JSON.stringify({ results: ["new"] }), { status: 200 }));
  pending[0].resolve(new Response(JSON.stringify({ results: ["old"] }), { status: 200 }));
  expect(await first).toBeNull();
  expect(await second).toEqual({ results: ["new"] });
  expect(pending[0].signal.aborted).toBe(true);
});
