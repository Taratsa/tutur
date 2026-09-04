import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let dataPromise;

export function loadSiteData() {
  dataPromise ??= readFile(resolve(process.cwd(), "../build/data/site.json"), "utf8").then(
    JSON.parse,
  );
  return dataPromise;
}
