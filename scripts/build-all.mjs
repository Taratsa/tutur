import { performance } from "node:perf_hooks";

const started = performance.now();
const commands = [
  ["bun", ["run", "clean"]],
  ["bun", ["run", "data:prepare"]],
  ["bun", ["run", "--cwd", "api", "db:build"]],
];

for (const [command, args] of commands) {
  const result = Bun.spawnSync([command, ...args], {
    cwd: new URL("../", import.meta.url).pathname,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

console.log(`BUILD_DURATION_MS ${Math.round(performance.now() - started)}`);
