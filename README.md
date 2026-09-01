# Uptime

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset=".github/readme-hero-light.png">
  <img alt="Uptime — self-hosted monitoring, beautifully simple" src=".github/readme-hero-light.png">
</picture>

[![Live demo](https://img.shields.io/badge/live_demo-online-00bc7d)](https://uptime.aarongreiner.dev)
[![Latest version](https://img.shields.io/github/v/tag/AaronGreiner/uptime?sort=semver&label=version)](https://github.com/AaronGreiner/uptime/tags)
[![Container image](https://img.shields.io/badge/container-ghcr.io-2496ED?logo=docker&logoColor=white)](https://github.com/AaronGreiner/uptime/pkgs/container/uptime)
[![License](https://img.shields.io/github/license/AaronGreiner/uptime)](./LICENSE)

A minimal, self-hosted uptime monitor with public, editable dashboards. Inspired
by Uptime Kuma, built with Nuxt 4, Nuxt UI 4, Bun and SQLite.

> [!TIP]
> **[Try the public demo →](https://uptime.aarongreiner.dev)**
>
> This is a shared testing instance, so feel free to explore, edit dashboards
> and try the admin features. Sign in as `admin`; finding the password is part
> of the demo. It is not a secret, and subtlety was not one of the requirements.
> Data may change or be reset at any time.

## Features

- **Public by default** — dashboards, monitor status and history are visible
  without an account; a single admin account manages the instance.
- **Editable dashboards** — combine live status, uptime, incidents, certificate
  expiry, response times and monitor lists into responsive layouts.
- **Fullscreen dashboards** — drop the whole interface around a dashboard for a
  wall display, from the navbar button or straight from the URL with
  `?fullscreen=1`.
- **HTTP(S) and ping monitors** — status code ranges, keyword matching, custom
  headers, TLS certificate expiry and ICMP round trip times.
- **Nested groups** — organise monitors in a tree and scope dashboards,
  notifications or maintenance to exactly the branch that needs them.
- **Custom icons** — choose icons for groups, monitors and dashboards from a
  searchable Lucide and Simple Icons preview grid. Icons currently used by any
  group, monitor or dashboard appear separately for quick reuse. Icons are
  served locally without contacting an external icon service.
- **Maintenance windows** — recurring schedules or a switch you flip by hand,
  on a single monitor or on a whole branch. A nightly reboot stops being an
  outage: no alert, no incident, and the uptime figure is left alone.
- **Incident and reliability history** — reconstruct outages, uptime, mean time
  to recovery and other reliability figures from recorded checks.
- **Instance connectivity awareness** — distinguish a broken monitored target
  from the monitoring host losing its own route or DNS, without counting the
  resulting blind period against every monitor.
- **SMTP and Microsoft Teams notifications** — route events through reusable
  groups with retries and persistent delivery history.
- **Live everywhere** — server-sent events update cards, widgets, navigation and
  status figures together without refreshing the page.
- **Long history, small database** — raw checks roll into hourly aggregates and
  are pruned on a schedule.
- **Light and dark mode**, **English and German**.

## Preview

The preview follows your GitHub theme. Open the
[live demo](https://uptime.aarongreiner.dev) to try the interface yourself.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/screenshots/dashboard-overview-dark.png">
  <source media="(prefers-color-scheme: light)" srcset=".github/screenshots/dashboard-overview-light.png">
  <img alt="Uptime dashboard overview with incidents, certificate expiry, response times and monitor status" src=".github/screenshots/dashboard-overview-light.png">
</picture>

## Quick start

The container image is published for `linux/amd64` and `linux/arm64`, so a
Raspberry Pi works as well as a VPS. The host only needs Docker Engine.

```bash
docker run -d \
  --name uptime \
  --restart unless-stopped \
  -p 3000:3000 \
  -v uptime-data:/data \
  ghcr.io/aarongreiner/uptime:latest
```

Open http://localhost:3000. On the first start, Uptime creates the admin account.
If no password was configured, the generated password is printed exactly once:

```bash
docker logs uptime
```

### Docker Compose

The included Compose file keeps the installation in its own directory and makes
upgrades predictable:

```bash
mkdir uptime && cd uptime
curl -O https://raw.githubusercontent.com/AaronGreiner/uptime/main/docker-compose.yml
docker compose up -d
docker compose logs uptime
```

Put configuration overrides in a `.env` next to the Compose file. At minimum, a
public instance should set its origin:

```dotenv
NUXT_PUBLIC_APP_URL=https://uptime.example.com
```

See the [Docker deployment guide](./docs/docker.md) for reverse proxies, TLS,
upgrades, backups, ping permissions and building the image yourself.

## Configuration

Everything is configured through environment variables. See
[`.env.example`](./.env.example) for the annotated list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NUXT_SESSION_PASSWORD` | — | **Required.** Seals the admin session cookie, 32+ characters. Generated and stored beside the database in Docker. |
| `NUXT_SESSION_COOKIE_SECURE` | `true` | Marks the session cookie `Secure`. Must be `false` on a plain HTTP origin. |
| `NUXT_ADMIN_USERNAME` | `admin` | Username of the single admin account, seeded once. |
| `NUXT_ADMIN_PASSWORD` | *(empty)* | Admin password. Empty means a random one is generated and logged once. |
| `NUXT_PUBLIC_ACCOUNT_UPDATES_ENABLED` | `true` | Allow changing the admin username and password in Settings. Disable this on a shared demo. |
| `NUXT_DATABASE_PATH` | `./data/uptime.db` | SQLite file location. |
| `NUXT_MIGRATIONS_DIR` | `./drizzle` | Folder holding the generated migrations. |
| `NUXT_SCHEDULER_ENABLED` | `true` | Set to `false` to run the UI without executing checks. |
| `NUXT_SCHEDULER_CONCURRENCY` | `10` | Checks running in parallel. |
| `NUXT_SCHEDULER_TICK_INTERVAL_MS` | `1000` | How often due monitors are picked up. |
| `NUXT_UPLINK_ENABLED` | `true` | Distinguish monitor failures from this instance losing its own internet connection. |
| `NUXT_UPLINK_TARGETS` | `1.1.1.1:443,9.9.9.9:443` | Independent comma-separated TCP endpoints used to verify the route out. |
| `NUXT_UPLINK_DNS_HOST` | `cloudflare.com` | Hostname resolved to verify the system DNS resolver. |
| `NUXT_UPLINK_TIMEOUT_MS` | `2000` | Deadline for one connectivity probe. |
| `NUXT_UPLINK_FAILURE_THRESHOLD` | `2` | Consecutive failed probes before the instance is announced as offline. |
| `NUXT_UPLINK_CACHE_MS` | `5000` | Milliseconds for which a probe verdict is reused. |
| `NUXT_RETENTION_HEARTBEAT_DAYS` | `7` | Days of raw per-check results to keep. |
| `NUXT_RETENTION_HOURLY_STATS_DAYS` | `365` | Days of hourly aggregates to keep. |
| `NUXT_RETENTION_NOTIFICATION_DAYS` | `30` | Days of notification delivery history to keep. |
| `NUXT_NOTIFICATIONS_ENABLED` | `true` | Set to `false` to queue notifications without delivering them. |
| `NUXT_SEED_DEMO_DATA` | `false` | Seed demo monitors and showcase dashboards. See below. |
| `NUXT_SEED_DEMO_HISTORY_DAYS` | `7` | Days of generated history for the demo monitors. |
| `NUXT_PUBLIC_APP_NAME` | `Uptime` | Name shown in the header and page titles. |
| `NUXT_PUBLIC_APP_URL` | *(empty)* | Public origin of this instance. Notification links need it; in Docker it also decides the cookie flag above. |

Credentials can also be changed later in the UI under **Settings** unless
`NUXT_PUBLIC_ACCOUNT_UPDATES_ENABLED` is set to `false`.

### Demo data

Setting `NUXT_SEED_DEMO_DATA=true` seeds fourteen monitors, three pre-built
dashboards and generated history, so the interface has something to show
immediately.

- It runs **at most once**, and only on a database that has no monitors yet.
- The demo monitors point at **real public endpoints** (`nuxt.com`,
  `api.github.com`, `1.1.1.1`, `example.com`). Enabling this sends actual requests
  to those hosts.
- Turning the flag back off does not remove anything already seeded. Use the
  data controls in **Settings** or start from a fresh database file.

Leave it at `false` for a real deployment.

#### Local demo login

Put this in `.env` to get a populated local instance with a known login:

```dotenv
NUXT_SESSION_PASSWORD=local-development-session-password-32
NUXT_ADMIN_USERNAME=admin
NUXT_ADMIN_PASSWORD=devpassword123
NUXT_SEED_DEMO_DATA=true
```

Then run `bun run dev` and sign in at http://localhost:3000/login with username
`admin` and password `devpassword123`.

> [!WARNING]
> These credentials are for the local demo only. Never use them on a reachable
> instance: choose your own `NUXT_ADMIN_PASSWORD` and a random
> `NUXT_SESSION_PASSWORD`, or use the password generated on first start.

## How it works

### Monitor types

**HTTP(S)** checks a URL and passes when the status code falls inside the
accepted range, for example `200-299,301`. It can require or reject a keyword,
send custom headers and a body, control redirects and track TLS certificate
expiry.

**Ping** sends ICMP echo requests through the system `ping` binary and records
the average round trip time. A check passes when at least one reply comes back;
packet loss is reported in the result message.

Both types share the check interval, timeout and retry settings. While retries
remain, a failed monitor is *pending* rather than *down*, keeping single blips
out of the incident history.

### Instance connectivity

After a monitor check fails, Uptime probes independent TCP endpoints and the
system DNS resolver. If the instance itself has lost connectivity, checks keep
being recorded but are not judged: monitor states and retry counters stay
frozen, uptime and incidents exclude the readings, and the interface shows the
blind period separately. Notification delivery waits for connectivity to
return; an optional recovery event then reports the completed monitoring gap.

The probes run only in response to a failed check, share a short cache and can
be changed or disabled with the `NUXT_UPLINK_*` variables. Choose endpoints that
do not depend on the services being monitored, otherwise one provider outage
could be mistaken for an outage of the monitoring instance.

### Maintenance

Servers that get restarted on a schedule are not having an outage. A maintenance
window says so: pick the weekdays, a start time and a length, and say whether it
covers one monitor or a whole group. Windows live together under **Settings →
Maintenance**, so the whole schedule of the instance reads as one list. They add
up rather than override, so one window on a root group can cover a branch while
a single monitor adds its own patch day.

For the unplanned kind there is a switch on the monitor or group itself — an
hour, a day, or until you turn it off again.

Inside a window the checks keep running and keep recording, so the history stays
complete and you can still see when the service came back. What changes is that
nothing is judged: no monitor is called *down*, no notification goes out, no
incident is reconstructed, and the failed checks are counted out of the uptime
instead of against it. When the window closes the retry count starts from zero,
so a machine that is still booting gets its usual tolerance before anyone is
woken up — and an outage that was already announced before the window still gets
its recovery notification afterwards.

Windows are read against one time zone for the whole instance, set on the admin
settings page, so a window at 03:00 stays at 03:00 across a daylight saving
change.

### Response time charts

Choose the chart style under **Settings → General → Response time chart**.
**Average only** is the default. **Outlined band**, **Ticks per bucket** and
**Neutral band** also show the minimum–maximum range around the average.
Minimum, average and maximum cannot be toggled individually.

The choice is stored in your browser and applies to monitor details and dashboard
charts. A latency widget can override it through **Chart style** in its settings;
**From settings** follows the browser preference. Chart headers have no style
selector.

Charts retain the full selected time range. Time before a monitor was created
stays empty; periods with unjudged checks or missing expected checks are
hatched. Bucket widths follow both the selected range and the monitor interval,
so a five-minute schedule is not rendered as a series of artificial 30-second
gaps.

### History and storage

Every check writes one row to `heartbeats`. A maintenance job rolls those rows
into hourly buckets and prunes data past its retention window. Ranges up to 24
hours read raw rows; longer ranges read the aggregates. This keeps a year of
history in a small SQLite database.

## Development

Install [Bun](https://bun.sh/) 1.3.9 or newer, then:

```bash
bun install
cp .env.example .env
openssl rand -base64 32
```

Put the generated value in `.env` as `NUXT_SESSION_PASSWORD`, then start the
development server:

```bash
bun run dev
```

The application is available at http://localhost:3000.

```bash
bun run build        # production build into .output
bun run typecheck    # vue-tsc across app, server and shared code
bun run lint         # eslint
bun run db:generate  # create a migration after changing the schema
bun run db:studio    # browse the database
```

Migrations run automatically at boot. Architecture notes, conventions and
extension points are in [AGENTS.md](./AGENTS.md).

## Deploying without Docker

A `v*` tag runs two independent GitHub Actions workflows: one publishes the
container image, the other ships the build to a server over SSH. The second one
is reusable — point the `DEPLOY_*` secrets at your own host and a tag in your
fork deploys there. It builds with Bun, uploads `.output/` and `drizzle/`, backs
up SQLite, restarts a systemd unit behind Caddy and rolls back when the health
check fails. The [deployment runbook](./deploy/RUNBOOK.md) covers the server
setup, the secrets and the recovery steps.

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run
`bun run typecheck` and `bun run lint`. Keep code and documentation in English,
and add every user-facing string to both locale files.

**Codex by OpenAI** contributed the widget sizing review, automatic list capacity
and browser verification of the responsive widget layouts.

## AI disclosure

> [!NOTE]
> This project was created by **Aaron Greiner** in collaboration with AI tools,
> including **Claude by Anthropic**, **ChatGPT by OpenAI** and **Codex by OpenAI**. AI assisted with
> implementation, review, documentation and problem-solving; the project is
> directed, curated and maintained by its human author.

## License

[MIT License](./LICENSE)
