import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);

for (const path of ["build"]) {
  await rm(resolve(root, path), { recursive: true, force: true });
}
console.log("Removed generated build output.");
