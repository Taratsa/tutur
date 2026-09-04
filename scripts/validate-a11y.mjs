import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const root = resolve(new URL("../", import.meta.url).pathname);
const uiDirectory = join(root, "ui");
const port = Number(process.env.A11Y_TEST_PORT ?? 43923);
const base = (process.env.BASE_PATH || "/").replace(/\/+$/u, "");
const origin = `http://127.0.0.1:${port}`;
const requestPath = (path) => `${origin}${base}${path === "/" ? "/" : path}`;
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const serverEntry = join(uiDirectory, "dist", "server", "entry.mjs");
if (!existsSync(serverEntry))
  throw new Error("ui/dist/server/entry.mjs is missing; run `bun run ui:build` first");

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

const ready = (async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(requestPath("/"));
      if (response.status === 200) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("SSR server did not start");
})();

// The interactive scan waits for hydration to settle the results panel into a
// results, empty, or error state so the dynamic UI is scanned, not just the shell.
async function runSearchInteraction(page) {
  await page.fill("#dictionary-search", "bahasa");
  await page
    .waitForSelector(".unified-results, .message.error, .engine-empty", { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

const desktopScans = [
  { label: "home", path: "/" },
  { label: "alphabet list", path: "/huruf/a/" },
  { label: "alphabet page 2", path: "/huruf/a/2/" },
  { label: "word page", path: "/kata/bahasa/" },
  { label: "enriched word page", path: "/kata/abu/" },
  { label: "popular words", path: "/populer/" },
  { label: "search idle", path: "/search/" },
  { label: "search results", path: "/search/", interact: runSearchInteraction },
  { label: "about", path: "/about/" },
  { label: "sumber", path: "/sumber/" },
  { label: "not found", path: "/404/" },
];
const mobileScans = [
  { label: "home (mobile)", path: "/" },
  { label: "alphabet list (mobile)", path: "/huruf/a/" },
  { label: "word page (mobile)", path: "/kata/bahasa/" },
  { label: "enriched word page (mobile)", path: "/kata/abu/" },
  { label: "popular words (mobile)", path: "/populer/" },
  { label: "search idle (mobile)", path: "/search/" },
];
const viewports = [
  { name: "desktop", width: 1280, height: 720, scans: desktopScans },
  { name: "mobile", width: 375, height: 812, scans: mobileScans },
];

const failures = [];
let scanned = 0;
let incompleteTotal = 0;
const verbose = process.env.A11Y_VERBOSE === "1";
const incompleteReport = [];
const started = performance.now();

try {
  await ready;
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(
      "Playwright Chromium is unavailable; run `bunx playwright install chromium` first",
      { cause: error },
    );
  }
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: "reduce",
      });
      // Validation builds are production builds, so drop analytics traffic
      // instead of sending test pageviews to the real collector.
      await context.route(/umami\.kenadera\.org/u, (route) => route.abort());
      const page = await context.newPage();
      for (const scan of viewport.scans) {
        const response = await page.goto(requestPath(scan.path), { waitUntil: "load" });
        if (response && response.status() >= 500)
          throw new Error(`${scan.path} returned ${response.status()}`);
        if (scan.interact) await scan.interact(page);
        const result = await new AxeBuilder({ page }).withTags(tags).analyze();
        scanned += 1;
        incompleteTotal += result.incomplete.length;
        if (verbose)
          for (const item of result.incomplete)
            incompleteReport.push({
              scan: `${viewport.name} ${scan.label}`,
              id: item.id,
              help: item.help,
              nodes: item.nodes.map((node) => node.target.join(" ")),
            });
        for (const violation of result.violations)
          failures.push({ viewport: viewport.name, label: scan.label, violation });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  child.kill();
  await child.exited;
}

if (failures.length) {
  const lines = ["Accessibility violations found:", ""];
  let current = null;
  for (const failure of failures) {
    const key = `${failure.viewport} ${failure.label}`;
    if (key !== current) {
      current = key;
      lines.push(`  [${failure.viewport}] ${failure.label}`);
    }
    const violation = failure.violation;
    lines.push(
      `    ${violation.impact ?? "unknown"} ${violation.id} (${violation.nodes.length} node(s)): ${violation.help}`,
      `      ${violation.helpUrl}`,
    );
    for (const node of violation.nodes.slice(0, 3))
      lines.push(`      ${node.target.join(" ") || "<no target>"}`);
    if (violation.nodes.length > 3)
      lines.push(`      … and ${violation.nodes.length - 3} more node(s)`);
  }
  lines.push("", `Total: ${failures.length} violation(s) across ${scanned} scans.`);
  console.error(lines.join("\n"));
  process.exit(1);
}

if (verbose && incompleteReport.length) {
  const lines = ["", "Checks that need manual review (incomplete):"];
  for (const item of incompleteReport)
    lines.push(
      `  [${item.scan}] ${item.id}: ${item.help}`,
      ...item.nodes.slice(0, 3).map((target) => `    ${target || "<no target>"}`),
    );
  console.log(lines.join("\n"));
}

console.log(
  `A11Y_METRICS ${JSON.stringify({
    scans: scanned,
    tags: tags.join("+"),
    violations: 0,
    incomplete: incompleteTotal,
    durationMs: Math.round(performance.now() - started),
  })}`,
);
