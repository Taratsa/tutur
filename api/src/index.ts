import { resolve } from "node:path";
import { openReadOnlyDatabase } from "./database.ts";
import { createApp } from "./app.ts";

const databasePath = resolve(process.cwd(), process.env.SEARCH_DB_PATH ?? "data/search.sqlite");
const db = openReadOnlyDatabase(databasePath);
const app = createApp({ db });
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

Bun.serve({ port, fetch: app.fetch });
console.log(`Search API listening on http://localhost:${port}`);
