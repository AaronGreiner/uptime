# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
# Pinned to the *build* platform on purpose. The Nuxt output is plain JavaScript
# and every dependency is pure JavaScript too — bun:sqlite is part of the Bun
# runtime rather than a native module — so one build serves every target
# architecture. Building per architecture instead would run Bun's JIT under
# QEMU, which is both slow and unreliable.
FROM --platform=$BUILDPLATFORM oven/bun:1.3.9-debian AS build

WORKDIR /app

# Dependencies first so that editing a source file does not reinstall them. The
# postinstall hook runs "nuxt prepare", which needs the full source tree, hence
# the split: install without scripts here, run them after the sources land.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

# The nitro preset comes from nuxt.config.ts; fail here rather than at boot.
RUN test -f ./.output/server/index.mjs

# --- Runtime ----------------------------------------------------------------
FROM oven/bun:1.3.9-debian AS runtime

LABEL org.opencontainers.image.source="https://github.com/AaronGreiner/uptime" \
      org.opencontainers.image.description="A minimal, self-hosted uptime monitor with editable dashboards." \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# iputils-ping carries cap_net_raw, which Docker grants by default. See
# docker-compose.yml for the sysctl that makes it work in stricter setups.
# util-linux is already there — Debian marks it essential — but the entrypoint
# drops privileges with its setpriv, so name it rather than assume it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping ca-certificates util-linux \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATABASE_PATH=/data/uptime.db \
    NUXT_MIGRATIONS_DIR=/app/drizzle

COPY --from=build /app/.output ./.output
# Migrations are read from disk at boot and are not part of the server bundle.
COPY --from=build /app/drizzle ./drizzle
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data && chown -R bun:bun /data /app

# Keeps the database out of the container layer when nothing is mounted, so a
# `docker run` without -v does not lose its history on the next `docker rm`.
VOLUME ["/data"]

EXPOSE 3000

# A cold start applies pending migrations before it listens, which takes a while
# on a small ARM box, so the start period is generous.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Deliberately left as root: the entrypoint takes ownership of a bind mounted
# /data and then drops to "bun" itself. Setting `user:` skips both steps, which
# only works when the mounted directory already belongs to that user.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "run", ".output/server/index.mjs"]
