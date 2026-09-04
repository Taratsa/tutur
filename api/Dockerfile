FROM oven/bun:1.3.14-alpine

WORKDIR /app
COPY package.json bun.lock ./
COPY shared/package.json shared/package.json
COPY shared/src shared/src
COPY api/package.json api/package.json
RUN bun install --frozen-lockfile --production

COPY api/src api/src
COPY api/data/search.sqlite api/data/search.sqlite

ENV PORT=3001
ENV SEARCH_DB_PATH=api/data/search.sqlite
EXPOSE 3001
CMD ["bun", "run", "--cwd", "api", "start"]
