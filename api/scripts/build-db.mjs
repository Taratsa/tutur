import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { buildDatabase, insertWordGraphs } from "../src/database.ts";

const dataPath = new URL("../../build/data/site.json", import.meta.url);
const graphPath = new URL("../../build/data/word_graph.json", import.meta.url);
const outputDirectory = new URL("../data/", import.meta.url);
const outputPath = fileURLToPath(new URL("search.sqlite", outputDirectory));
const temporaryPath = fileURLToPath(new URL("search.sqlite.next", outputDirectory));

const data = await Bun.file(dataPath).json();
let graphs = null;
try {
  graphs = (await Bun.file(graphPath).json()).graphs ?? null;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(outputDirectory, { recursive: true });
await rm(temporaryPath, { force: true });
try {
  const result = buildDatabase(data, temporaryPath);
  let graphCount = 0;
  if (graphs) {
    const graphDb = new Database(temporaryPath);
    graphCount = insertWordGraphs(graphDb, graphs);
    graphDb.close();
  }
  await rename(temporaryPath, outputPath);
  console.log(
    `DB_METRICS ${JSON.stringify({ ...data.stats, ...result, graphWords: graphCount, bytes: Bun.file(outputPath).size })}`,
  );
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}
