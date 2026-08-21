# Uptime

A minimal, self-hosted uptime monitor with editable dashboards. Inspired by
Uptime Kuma, built with Nuxt 4, Nuxt UI 4 and SQLite.

- **Public by default** — dashboards and monitor status are visible without an
  account. A single admin account can create and change things.
- **Dashboard shell** — collapsible, resizable sidebar whose width and folded
  groups are remembered; every page gets its own navbar and toolbar.
- **Editable dashboards** — reorder widgets and size them with constrained
  width and height tokens that adapt across screen sizes.
- **HTTP(S) and ping monitors** — status code ranges, keyword matching, custom
  headers, TLS certificate expiry, ICMP round trip times.
- **Nested groups** — organise monitors into a tree, browse it from the sidebar,
  and keep the full monitor list one click away.
- **Light and dark mode**, **English and German**.
- **Long history, small database** — raw results roll into hourly aggregates and
  are pruned on a schedule.

## Quick start

Install [Bun](https://bun.sh/) 1.3.9 or newer, then:

```bash
bun install
cp .env.example .env
```

Set at least `NUXT_SESSION_PASSWORD` in `.env` (32+ characters):

```bash
openssl rand -base64 32
```

Then start it:

```bash
bun run dev
```

The app runs on http://localhost:3000. On the first start it creates the admin
account. If `NUXT_ADMIN_PASSWORD` is empty, a random password is generated and
printed to the console **once** — copy it, or set your own beforehand.

## Docker

```bash
cp .env.example .env   # set NUXT_SESSION_PASSWORD
docker compose up -d
```

The SQLite file lives in the `uptime-data` volume at `/data/uptime.db`. Ping
monitors need unprivileged ICMP sockets; the compose file sets the
`net.ipv4.ping_group_range` sysctl for that. If your host forbids it, either drop
ping monitors or grant the container `CAP_NET_RAW`.

## Deploying

Tagged releases ship to a server through GitHub Actions:
`.github/workflows/deploy.yml` builds with Bun, uploads `.output/` and
`drizzle/`, backs up the SQLite file, restarts a systemd unit and rolls back if
the new build does not answer on `/api/health`.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Because `nitro.preset` is `bun` and the driver is `bun:sqlite`, the service runs
on Bun rather than node, and `drizzle/` must sit next to the build — migrations
are read from disk at boot. The full setup, the secrets to configure and the
recovery steps are in [deploy/RUNBOOK.md](./deploy/RUNBOOK.md).

## Configuration

Everything is set through environment variables. See `.env.example` for the
annotated list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NUXT_SESSION_PASSWORD` | — | **Required.** Seals the admin session cookie, 32+ characters. |
| `NUXT_ADMIN_USERNAME` | `admin` | Username of the single admin account, seeded once. |
| `NUXT_ADMIN_PASSWORD` | *(empty)* | Admin password. Empty means a random one is generated and logged once. |
| `NUXT_DATABASE_PATH` | `./data/uptime.db` | SQLite file location. |
| `NUXT_MIGRATIONS_DIR` | `./drizzle` | Folder holding the generated migrations. |
| `NUXT_SCHEDULER_ENABLED` | `true` | Set to `false` to run the UI without executing checks. |
| `NUXT_SCHEDULER_CONCURRENCY` | `10` | Checks running in parallel. |
| `NUXT_SCHEDULER_TICK_INTERVAL_MS` | `1000` | How often due monitors are picked up. |
| `NUXT_RETENTION_HEARTBEAT_DAYS` | `7` | Days of raw per-check results to keep. |
| `NUXT_RETENTION_HOURLY_STATS_DAYS` | `365` | Days of hourly aggregates to keep. |
| `NUXT_SEED_DEMO_DATA` | `false` | Seed demo monitors and showcase dashboards. See below. |
| `NUXT_SEED_DEMO_HISTORY_DAYS` | `3` | Days of generated history for the demo monitors. |
| `NUXT_PUBLIC_APP_NAME` | `Uptime` | Name shown in the header and page titles. |

Credentials can also be changed later in the UI under **Settings**, which is the
recommended way once the instance is running.

### Demo data

Setting `NUXT_SEED_DEMO_DATA=true` seeds fourteen monitors, three pre-built
dashboards showing different widget compositions, and a few days of generated
history, so the UI has something to show immediately.

- It runs **at most once**, and only on a database that has no monitors yet.
- The demo monitors point at **real public endpoints** (`nuxt.com`,
  `api.github.com`, `1.1.1.1`, `example.com`). Enabling this makes the scheduler
  send actual requests to those hosts.
- Turning the flag back off does not remove anything already seeded. Use the
  data controls in **Settings** to remove or replace the demo data, or start from
  a fresh database file.

Leave it at `false` for a real deployment.

#### Trying the demo

Put this in `.env` to get a fully populated instance with a known login:

```bash
NUXT_SESSION_PASSWORD=local-development-session-password-32
NUXT_ADMIN_USERNAME=admin
NUXT_ADMIN_PASSWORD=devpassword123
NUXT_SEED_DEMO_DATA=true
```

Then run `bun run dev` and sign in at http://localhost:3000/login with:

- Username: `admin`
- Password: `devpassword123`

> **These credentials are for the local demo only.** They are published here, so
> anyone can read them. Never use them on a reachable instance: pick your own
> `NUXT_ADMIN_PASSWORD` and a random `NUXT_SESSION_PASSWORD` before deploying, or
> leave the admin password empty and use the one generated on first start.

Without demo data the seeded account is the same, only the monitors and
dashboards are missing.

## Monitor types

**HTTP(S)** — checks a URL and passes when the status code falls inside the
accepted range (for example `200-299,301`). Optionally requires a keyword in the
response body (or requires its absence), sends custom headers and a body, follows
or ignores redirects, and reads the TLS certificate expiry off the same
connection.

**Ping** — sends ICMP echo requests through the system `ping` binary and records
the average round trip time. A check passes when at least one reply comes back;
packet loss is reported in the result message.

Both types share the schedule settings: check interval, timeout, and how many
consecutive failures are tolerated before the monitor is reported as down. While
retries are left, the monitor shows as *pending* rather than *down*, which keeps
single blips out of the incident history.

## How the data is stored

Every check writes one row to `heartbeats`. A maintenance job runs every five
minutes, rolls those rows into hourly buckets, and prunes anything past its
retention window. Charts and uptime figures for ranges up to 24 hours read the
raw rows; longer ranges read the aggregates. That keeps a year of history in a
database that stays small.

## Development

```bash
bun run dev          # dev server
bun run typecheck    # vue-tsc across app, server and shared code
bun run lint         # eslint
bun run db:generate  # create a migration after changing server/database/schema.ts
bun run db:studio    # browse the database
```

Migrations run automatically at boot, so a fresh checkout only needs `bun run dev`.

Architecture notes, conventions and extension points are in
[CLAUDE.md](./CLAUDE.md).

## License

MIT
