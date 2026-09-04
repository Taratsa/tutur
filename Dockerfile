# Tag mengambang 1.x mengikuti rilis Bun terbaru (pola resmi oven/bun:1)
FROM oven/bun:1-alpine AS base

# --- Tahap build: database SQLite dibuat dari source JSON -------------------
FROM base AS build
WORKDIR /app

# Manifest workspace lebih dulu: instalasi dependensi ter-cache sampai lockfile
# berubah. Linker hoisted menjaga layout node_modules klasik agar salinan
# runtime tidak bergantung pada symlink toko paket Bun.
COPY package.json bun.lock ./
COPY shared/package.json shared/package.json
COPY api/package.json api/package.json
RUN bun install --frozen-lockfile --linker hoisted

COPY shared/src shared/src
COPY scripts scripts
COPY api api

# Sumber dataset yang dibaca scripts/prepare-data.mjs
COPY edisi-IV/dictionary__JSON.json edisi-IV/dictionary__JSON.json
COPY baku-nonbaku/dictionary_baku_nonbaku__JSON.json baku-nonbaku/dictionary_baku_nonbaku__JSON.json
COPY sinonim/dictionary_sinonim__JSON.json sinonim/dictionary_sinonim__JSON.json
COPY antonim/dictionary_antonim__JSON.json antonim/dictionary_antonim__JSON.json

# Alur sama dengan `bun run build`: normalisasi JSON -> SQLite
RUN bun run data:prepare \
 && bun run --cwd api db:build

# --- Tahap runtime -----------------------------------------------------------
FROM base
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    SEARCH_DB_PATH=/app/api/data/search.sqlite

# API pencarian: sumber, hono (nol dependensi transitif), dan @tutur/shared
# (salinan nyata, tanpa symlink toko paket)
COPY --from=build /app/api/src api/src
COPY --from=build /app/node_modules/hono node_modules/hono
COPY --from=build /app/shared/package.json node_modules/@tutur/shared/package.json
COPY --from=build /app/shared/src node_modules/@tutur/shared/src/

# Database hanya dibuka read-only
COPY --from=build /app/api/data/search.sqlite api/data/search.sqlite

USER bun
EXPOSE 3001

CMD ["bun", "api/src/index.js"]
