import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const files = [];
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      if (!["node_modules", "dist", ".astro"].includes(item.name)) await collect(path);
    } else if (/\.(js|mjs|ts)$/u.test(item.name) && !path.endsWith("/scripts/lint.mjs")) {
      files.push(path);
    }
  }
}
await Promise.all(["shared", "api", "scripts"].map((directory) => collect(join(root, directory))));

const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (source.includes("location.hash")) violations.push(`${file}: hash routing is not allowed`);
  if (source.includes("DOMParser"))
    violations.push(`${file}: DOMParser is not allowed in published pages`);
  if (source.includes("public/data"))
    violations.push(`${file}: full client data publication is not allowed`);
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`LINT_OK ${files.length} source files checked`);
}
