import { mkdir, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildDatabase } from "../src/database.js";

const dataPath = new URL("../../build/data/site.json", import.meta.url);
const outputDirectory = new URL("../data/", import.meta.url);
const outputPath = fileURLToPath(new URL("search.sqlite", outputDirectory));
const temporaryPath = fileURLToPath(new URL("search.sqlite.next", outputDirectory));

const data = await Bun.file(dataPath).json();
await mkdir(outputDirectory, { recursive: true });
await rm(temporaryPath, { force: true });
try {
  const result = buildDatabase(data, temporaryPath);
  await rename(temporaryPath, outputPath);
  console.log(`DB_METRICS ${JSON.stringify({ ...data.stats, ...result, bytes: Bun.file(outputPath).size })}`);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}
