FROM oven/bun:1.4.4 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile

COPY apps/api ./apps/api
RUN bun run --cwd apps/api build

FROM oven/bun:1.4.4-slim AS production-deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --production --filter @archivero/api

FROM oven/bun:1.4.4-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-deps --chown=bun:bun /app/package.json ./
COPY --from=production-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps/api ./apps/api

USER bun
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/api/src/index.ts"]
