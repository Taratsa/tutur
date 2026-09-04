# Tag mengambang 1.x mengikuti rilis Bun terbaru (pola resmi oven/bun:1)
FROM oven/bun:1-alpine AS base

# --- Tahap build: database SQLite + bundle SSR Astro ------------------------
FROM base AS build
WORKDIR /app

# Manifest workspace lebih dulu: instalasi dependensi ter-cache sampai lockfile
# berubah. Linker hoisted menjaga layout node_modules klasik agar chunk SSR Astro
# tetap bisa menyelesaikan impor dependensi yang dieksternalisasi.
COPY package.json bun.lock ./
COPY shared/package.json shared/package.json
COPY api/package.json api/package.json
COPY ui/package.json ui/package.json
RUN bun install --frozen-lockfile --linker hoisted

COPY shared/src shared/src
COPY scripts scripts
COPY api api
COPY ui ui

# Sumber dataset yang dibaca scripts/prepare-data.mjs
COPY data/edisi-IV/dictionary__JSON.json data/edisi-IV/dictionary__JSON.json
COPY data/baku-nonbaku/dictionary_baku_nonbaku__JSON.json data/baku-nonbaku/dictionary_baku_nonbaku__JSON.json
COPY data/sinonim/dictionary_sinonim__JSON.json data/sinonim/dictionary_sinonim__JSON.json
COPY data/antonim/dictionary_antonim__JSON.json data/antonim/dictionary_antonim__JSON.json
COPY data/indolex/indolex__JSON.json data/indolex/indolex__JSON.json
COPY data/indolex/indolex_root_frequencies__JSON.json data/indolex/indolex_root_frequencies__JSON.json
COPY data/indolex/kbbi_edisi_iv_enrichment__JSON.json data/indolex/kbbi_edisi_iv_enrichment__JSON.json
COPY data/kamus-alay/dictionary_kamus_alay__JSON.json data/kamus-alay/dictionary_kamus_alay__JSON.json
COPY data/kbbi-v6/kbbi_v6__JSON.json data/kbbi-v6/kbbi_v6__JSON.json
COPY data/leipzig data/leipzig

# Alur sama dengan `bun run build` tanpa langkah validasi: normalisasi JSON -> SQLite
RUN bun run data:prepare \
 && bun scripts/prepare-word-graph.ts \
 && bun run --cwd api db:build

# Bundle SSR Astro menyematkan SITE_URL dan URL API ke aset client saat build
ARG SITE_URL=http://localhost:4321
ARG BASE_PATH=/
ARG PUBLIC_SEARCH_API_URL=http://localhost:3001
ENV SITE_URL=$SITE_URL \
    BASE_PATH=$BASE_PATH \
    PUBLIC_SEARCH_API_URL=$PUBLIC_SEARCH_API_URL \
    UI_DATABASE_PATH=../api/data/search.sqlite
RUN bun run --cwd ui astro:build

# Astro mengeksternalisasi sebagian dependensinya ke chunk SSR (impor statis dan
# dinamis). Pindai bundle untuk menemukan semua specifier tanpa jalur relatif,
# lalu kumpulkan salinan nyata (bukan symlink toko paket) agar runtime tidak
# bergantung pada layout instalasi Bun. Paket yang tidak terpasang dilewati.
# Salinan @tutur/shared dipasang langsung sebagai paket API.
RUN <<'EOF'
set -e
bun -e '
const { existsSync, readdirSync, readFileSync, mkdirSync, cpSync } = require("node:fs");
const root = "/app/ui/dist/server";
const specs = new Set();
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".mjs")) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/(?:from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["\x27]([^"\x27\n]+)["\x27]/g)) specs.add(match[1]);
    }
  }
};
walk(root);
const bare = [...specs].filter(
  (spec) => !spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("#") && !spec.startsWith("node:") && !spec.startsWith("bun:") && !spec.includes("${"),
);
const packages = new Set(
  bare.map((spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0])),
);
mkdirSync("/app/runtime-ui/node_modules", { recursive: true });
mkdirSync("/app/runtime-api/node_modules/@tutur", { recursive: true });
// Pacet yang dilingkup (nested) di node_modules milik pacet lain tidak terlihat
// oleh resolusi dari /app/ui; cari langsung di pohon node_modules sebagai cadangan.
function findPkgDir(pkg) {
  const stack = ["/app/node_modules"];
  while (stack.length) {
    const dir = stack.pop();
    const candidate = dir + "/" + pkg;
    if (existsSync(candidate + "/package.json")) return candidate;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === ".bin") continue;
      const nested = dir + "/" + entry.name + "/node_modules";
      if (existsSync(nested)) stack.push(nested);
    }
  }
  return null;
}

function resolvePkgDir(pkg, paths) {
  try {
    const resolved = require.resolve(pkg, { paths });
    const marker = "/node_modules/" + pkg + "/";
    const markerIndex = resolved.lastIndexOf(marker);
    if (markerIndex >= 0) return resolved.slice(0, markerIndex + marker.length - 1);
  } catch {
  }
  return findPkgDir(pkg);
}

const queue = [...packages].map((pkg) => ({ pkg, paths: ["/app/ui"] }));
const queued = new Set(packages);
const copied = new Set();
while (queue.length) {
  const { pkg, paths } = queue.shift();
  if (copied.has(pkg)) continue;
  const sourceDir = resolvePkgDir(pkg, paths);
  copied.add(pkg);
  if (!sourceDir) {
    console.log("SKIP (tidak terpasang):", pkg);
    continue;
  }
  const destination = "/app/runtime-ui/node_modules/" + pkg;
  mkdirSync(destination.slice(0, destination.lastIndexOf("/")), { recursive: true });
  cpSync(sourceDir, destination, { recursive: true, dereference: true });
  console.log("COPY", pkg, "dari", sourceDir);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(sourceDir + "/package.json", "utf8"));
  } catch {
    manifest = {};
  }
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const dependency of Object.keys(manifest[field] ?? {})) {
      if (queued.has(dependency)) continue;
      queued.add(dependency);
      queue.push({ pkg: dependency, paths: [sourceDir] });
    }
  }
}
let honoResolved;
try {
  honoResolved = require.resolve("hono", { paths: ["/app/api"] });
} catch {
  throw new Error("hono tidak ditemukan untuk runtime API");
}
const honoMarker = "/hono/";
cpSync(
  honoResolved.slice(0, honoResolved.lastIndexOf(honoMarker) + honoMarker.length),
  "/app/runtime-api/node_modules/hono",
  { recursive: true, dereference: true },
);
cpSync("/app/shared", "/app/runtime-api/node_modules/@tutur/shared", { recursive: true, dereference: true });
'
EOF

# --- Tahap runtime -----------------------------------------------------------
FROM base
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    UI_DATABASE_PATH=/app/api/data/search.sqlite \
    SEARCH_DB_PATH=/app/api/data/search.sqlite

# Bundle SSR UI + paket-paket yang dieksternalisasi Astro
COPY --from=build /app/ui/dist ui/dist
COPY --from=build /app/runtime-ui/node_modules ui/node_modules

# API pencarian: sumber, hono, dan @tutur/shared (salinan nyata, tanpa symlink)
COPY --from=build /app/api/src api/src
COPY --from=build /app/runtime-api/node_modules api/node_modules

# Database hanya dibuka read-only
COPY --from=build /app/api/data/search.sqlite api/data/search.sqlite

USER bun
EXPOSE 4321 3001

# Server SSR UI di 4321 secara default; jalankan API pencarian dengan:
#   docker run -e PORT=3001 -p 3001:3001 tutur bun api/src/index.ts
CMD ["bun", "ui/dist/server/entry.mjs"]
