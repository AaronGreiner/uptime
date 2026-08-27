# Docker deployment

The [README](../README.md#quick-start) contains the shortest path to a running
container. This guide covers the operational details for a public installation.

## Image and versions

The image is published to `ghcr.io/aarongreiner/uptime` for `linux/amd64` and
`linux/arm64`.

- `latest` follows the newest release.
- A minor tag such as `0.1` receives patch releases in that line.
- An exact tag such as `0.1.0` stays pinned until it is changed manually.

Use a minor or exact tag when upgrades need to happen on a controlled schedule.

## Environment

With Docker Compose, put configuration overrides in a `.env` beside
`docker-compose.yml`. Every variable from [`.env.example`](../.env.example) is
available. The Compose file deliberately fixes these container paths:

```dotenv
NUXT_DATABASE_PATH=/data/uptime.db
NUXT_MIGRATIONS_DIR=/app/drizzle
```

Set the public origin on every reachable instance:

```dotenv
NUXT_PUBLIC_APP_URL=https://uptime.example.com
```

Notification links use that origin. The container also derives
`NUXT_SESSION_COOKIE_SECURE` from it: an HTTPS origin enables the `Secure`
cookie flag, while an HTTP origin disables it so the browser does not discard
the session cookie. An explicit `NUXT_SESSION_COOKIE_SECURE` value wins.

## Reverse proxy

Do not expose port 3000 publicly when a reverse proxy runs on the same host.
Bind it to the loopback interface instead:

```yaml
ports:
  - "127.0.0.1:3000:3000"
```

Allow ports 80 and 443 through the host firewall and proxy the public hostname
to that local port. A minimal Caddy configuration is:

```caddyfile
uptime.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Caddy obtains and renews the TLS certificate automatically when the hostname's
DNS record points at the server and ports 80 and 443 reach it.

Live updates use server-sent events. The endpoint sends
`X-Accel-Buffering: no`, so Caddy and nginx stream it without additional
configuration.

## Data and upgrades

The SQLite database and generated session password live in `/data`. Keep that
path on a named volume or bind mount; everything else in the container is
disposable.

Upgrade a Compose installation with:

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically at boot. The container starts as root
only long enough to hand a mounted `/data` directory to its unprivileged user,
then drops privileges before starting Uptime.

## Backups

A persistent volume survives container replacement, but it is not a backup.
Stop the service briefly so SQLite flushes its write-ahead log, copy the data
and start it again:

```bash
docker compose stop uptime
mkdir uptime-backup
docker compose cp uptime:/data/. ./uptime-backup/
docker compose start uptime
```

Store the backup outside the server as well. It includes the database and the
generated `.session_password`. Losing the session password does not remove
monitors or the admin account, but it signs everyone out.

## Ping monitors

Ping requires unprivileged ICMP sockets. The Compose file opens
`net.ipv4.ping_group_range`, and the image gives the `ping` binary
`cap_net_raw`. If the host permits neither, ping monitors report as down while
HTTP monitors continue working.

## Building the image

Build a local image from the repository root:

```bash
docker build -t uptime .
```

The Nuxt output is plain JavaScript. Multi-architecture releases therefore run
the build stage once on the build platform and assemble only the small runtime
stage for each target architecture.
