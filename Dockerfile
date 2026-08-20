# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
FROM oven/bun:1.3.9-debian AS build

WORKDIR /app

# The postinstall hook runs "nuxt prepare", which needs the full source tree.
COPY . .

RUN bun install --frozen-lockfile
RUN bun run build

# --- Runtime ----------------------------------------------------------------
FROM oven/bun:1.3.9-debian AS runtime

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

RUN mkdir -p /data && chown -R bun:bun /data /app

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", ".output/server/index.mjs"]
