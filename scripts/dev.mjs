const root = new URL("../", import.meta.url).pathname;
const apiPort = process.env.API_PORT ?? "3001";
const uiPort = process.env.UI_PORT ?? "43921";
const siteUrl = process.env.SITE_URL ?? `http://localhost:${uiPort}`;
const testPort = process.env.SSR_TEST_PORT ?? String(Number.parseInt(uiPort, 10) + 1);

const build = Bun.spawnSync(["bun", "run", "build"], {
  cwd: root,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, SITE_URL: siteUrl, SSR_TEST_PORT: testPort },
});
if (build.exitCode !== 0) process.exit(build.exitCode);

const children = [
  Bun.spawn(["bun", "src/index.js"], {
    cwd: `${root}api`,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      PORT: apiPort,
      CORS_ORIGIN: process.env.CORS_ORIGIN ?? siteUrl,
      SEARCH_DB_PATH: process.env.SEARCH_DB_PATH ?? "data/search.sqlite",
    },
  }),
  Bun.spawn(["bun", "dist/server/entry.mjs"], {
    cwd: `${root}ui`,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      HOST: process.env.HOST ?? "127.0.0.1",
      PORT: uiPort,
      SITE_URL: siteUrl,
      UI_DATABASE_PATH: process.env.UI_DATABASE_PATH ?? "../api/data/search.sqlite",
      PUBLIC_SEARCH_API_URL:
        process.env.PUBLIC_SEARCH_API_URL ?? `http://localhost:${apiPort}/api/search`,
    },
  }),
];

const exitCodes = await Promise.all(children.map((child) => child.exited));
for (const child of children) child.kill();
process.exitCode = exitCodes.find((code) => code !== 0) ?? 0;
