# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 is compiled from source during the install step.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# The postinstall hook runs "nuxt prepare", which needs the full source tree.
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build

# --- Runtime ----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

# iputils-ping carries cap_net_raw, which Docker grants by default. See
# docker-compose.yml for the sysctl that makes it work in stricter setups.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATABASE_PATH=/data/uptime.db \
    NUXT_MIGRATIONS_DIR=/app/drizzle

COPY --from=build /app/.output ./.output
# Migrations are read from disk at boot and are not part of the server bundle.
COPY --from=build /app/drizzle ./drizzle

RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
