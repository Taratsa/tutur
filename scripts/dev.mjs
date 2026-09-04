const root = new URL("../", import.meta.url).pathname;
const apiPort = process.env.API_PORT ?? "3001";

const build = Bun.spawnSync(["bun", "run", "api:build"], {
  cwd: root,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
if (build.exitCode !== 0) process.exit(build.exitCode);

const child = Bun.spawn(["bun", "src/index.js"], {
  cwd: `${root}api`,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    PORT: apiPort,
    SEARCH_DB_PATH: process.env.SEARCH_DB_PATH ?? "data/search.sqlite",
  },
});
process.exitCode = await child.exited;
