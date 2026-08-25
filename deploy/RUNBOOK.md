# Deployment runbook

The instance runs as a plain systemd service behind Caddy on a single Ubuntu
box that also hosts unrelated projects. A release is a git tag: pushing `v*`
runs [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which
builds with Bun, uploads the build, backs up the database and restarts the unit.

Everything below is already in place on `87.106.223.169`. It is written so the
whole setup can be reproduced on a new machine, and so the moving parts are
findable when something breaks.

## Shape of the deployment

| Piece | Value |
|---|---|
| Domain | `uptime.aarongreiner.dev` |
| Deploy root | `/var/www/uptime` |
| Service | `uptime.service` |
| Port | `3003` on `127.0.0.1` |
| Runtime | Bun 1.3.9 at `/usr/local/bin/bun` |
| Database | `/var/www/uptime/data/uptime.db` |
| Backups | `/var/www/uptime/data/backups/`, last 10 releases |

The port is host wide unique. Taken on this machine: `3000` tcg_home, `3001`
tram, `3002` q2-app, `5080` q2-api, `3003` uptime.

The deploy root holds four things. Only the first two are replaced by a release:

```
/var/www/uptime
├── .output/     the nitro build
├── drizzle/     migrations, read from disk at boot
├── data/        SQLite database, WAL files and backups
└── .env         secrets, rendered from GitHub secrets on every deploy
```

## Why this differs from the other Nuxt projects on the box

They run on node. This one cannot: `nuxt.config.ts` sets `nitro.preset: 'bun'`
and the database driver is `bun:sqlite`, so `ExecStart` calls `bun`. Two things
follow from that, and both are easy to get wrong:

- Bun must be installed on the server, pinned to the version in the
  `packageManager` field of `package.json`.
- `drizzle/` has to ship next to the build. `migrateDatabase()` reads the folder
  from disk at boot; the migrations are not part of the server bundle. Without
  it the service refuses to start instead of silently running an old schema.
- Bun closes a connection that saw no traffic for ten seconds, which is shorter
  than a quiet `/api/events` stream. `NITRO_BUN_IDLE_TIMEOUT` in the unit raises
  that; it is the only way to reach `Bun.serve`, and the maximum it accepts is
  255. The stream's own keep alive stays below the limit either way, so this is
  headroom rather than the mechanism.

`WorkingDirectory` must stay the deploy root, because the runtime config
resolves `databasePath` and `migrationsDir` relative to `process.cwd()`.

## One time server setup

Install Bun, pinned:

```bash
apt-get install -y unzip
curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/bun bash -s "bun-v1.3.9"
ln -sf /opt/bun/bin/bun /usr/local/bin/bun
bun -e 'new (require("bun:sqlite").Database)(":memory:"); console.log("bun:sqlite OK")'
```

Create the layout and install the unit from this folder:

```bash
mkdir -p /var/www/uptime/{data,.output,drizzle}
install -m 644 uptime.service /etc/systemd/system/uptime.service
systemctl daemon-reload && systemctl enable uptime.service
```

Give GitHub Actions its own key, so it can be revoked without touching the
others:

```bash
ssh-keygen -t ed25519 -N '' -C gh-deploy-uptime -f /root/.ssh/gh_deploy_uptime
cat /root/.ssh/gh_deploy_uptime.pub >> /root/.ssh/authorized_keys
cat /root/.ssh/gh_deploy_uptime          # goes into the DEPLOY_KEY secret
```

Append a Caddy site block. Caddy serves other domains from the same file, so
append, never overwrite. Automatic HTTPS and server sent events on `/api/events`
both work without extra directives — do not add `encode` here, it buffers the
event stream:

```bash
cat >> /etc/caddy/Caddyfile <<'CADDY'

uptime.aarongreiner.dev {
	reverse_proxy 127.0.0.1:3003
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

## DNS

One `A` record, `uptime.aarongreiner.dev` → `87.106.223.169`.

**Create the record before the Caddy block, or reload afterwards.** Caddy asks
for the certificate the moment the site block loads. If the name does not
resolve yet, Let's Encrypt answers `NXDOMAIN` and Caddy backs off exponentially,
quickly to intervals of an hour — it will not notice the record appearing in the
meantime, and until then every browser gets `ERR_SSL_PROTOCOL_ERROR` because
there is no certificate to complete the handshake. One reload resets that:

```bash
systemctl reload caddy
journalctl -u caddy -f | grep uptime      # "certificate obtained successfully"
```

```bash
dig +short @8.8.8.8 uptime.aarongreiner.dev A     # must print the server IP
```

## GitHub secrets

Repository → Settings → Secrets and variables → Actions.

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `87.106.223.169` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_PATH` | `/var/www/uptime` |
| `DEPLOY_KEY` | private key from `/root/.ssh/gh_deploy_uptime`, including the BEGIN and END lines |
| `NUXT_SESSION_PASSWORD` | 32+ random characters, `openssl rand -base64 32`. Rotating it signs everyone out |
| `NUXT_ADMIN_USERNAME` | optional, defaults to `admin` |
| `NUXT_ADMIN_PASSWORD` | optional. Only seeds the account on an empty database; later changes happen in the UI |

Optional repository *variables* tune the instance without a code change:
`NUXT_PUBLIC_APP_NAME`, `NUXT_PUBLIC_APP_URL`, `NUXT_RETENTION_HEARTBEAT_DAYS`,
`NUXT_RETENTION_HOURLY_STATS_DAYS`, `NUXT_RETENTION_NOTIFICATION_DAYS`,
`NUXT_SCHEDULER_CONCURRENCY`. The workflow falls back to the defaults from
`.env.example` when they are unset.

Set `NUXT_PUBLIC_APP_URL` to the public origin of the instance, without a
trailing slash — `https://uptime.example.com`. Notifications link back to the
monitor they are about, and while this is empty they leave the button out rather
than sending everyone to localhost.

## Notifications

Nothing is configured from the environment: channels and notification groups are
created in the UI, under Settings → Notifications, and their credentials are
stored in the database.

What the host has to allow is outbound traffic: TCP 587 or 465 to the SMTP
server, and 443 for a Teams workflow webhook. The systemd unit needs no change.

A Teams channel expects a Power Automate workflow webhook, created in Teams from
the "Post to a channel when a webhook request is received" template. The old
Office 365 connector URLs on `*.webhook.office.com` are retired and are rejected
when the channel is saved.

The channel's format has to match the action inside that workflow. The template
ships with "Post card in a chat or channel", which posts a laid out card but no
preview text — the channel list and the activity feed show "Card". For a preview,
open the flow, replace that action with "Post message in a chat or channel", set
its Message to the `text` field of the trigger body, and switch the channel to
either the plain or experimental modern HTML message format. Both message
formats use the same workflow action.

Delivery is queued in the database and retried after 30 s, 2 min and 10 min
before it is given up on, so a mail server that is briefly down costs nothing. A
channel that keeps failing shows its last error on the notifications page, and
the delivery log there lists what the queue did. `journalctl -u uptime -f` shows
the same failures with `[notifications]` in front of them.

Values are written to `/var/www/uptime/.env` as unquoted `KEY=value` lines, which
is what systemd reads. They must not contain newlines or leading and trailing
spaces.

## Releasing

```bash
git tag v1.0.0 && git push origin v1.0.0
```

`workflow_dispatch` runs the same job from the Actions tab, useful for
redeploying the current tag or rotating a secret.

The job stages the upload in `.staging`, backs up the database, renames the
previous release aside, swaps, restarts and then polls `/api/health` for 30
seconds. If it never answers, the previous `.output/` and `drizzle/` are moved
back and the service is restarted, and the job fails. Migrations are forward
only, so that rollback restores the code, not the schema — if a migration is at
fault, restore from `data/backups/` by hand.

## Operating

```bash
systemctl status uptime.service
journalctl -u uptime.service -f
curl -s http://127.0.0.1:3003/api/health           # {"status":"ok","database":true}
```

The admin password generated on a first boot without `NUXT_ADMIN_PASSWORD` is
printed exactly once:

```bash
journalctl -u uptime.service | grep -A2 'generated password'
```

Manual rollback to the release kept aside by the last deploy:

```bash
systemctl stop uptime.service
cd /var/www/uptime && rm -rf .output drizzle
mv .output.previous .output && mv drizzle.previous drizzle
systemctl start uptime.service
```

Restore a database backup:

```bash
systemctl stop uptime.service
cd /var/www/uptime/data
rm -f uptime.db uptime.db-wal uptime.db-shm      # the WAL belongs to the old file
cp backups/uptime_YYYYMMDD_HHMMSS.db uptime.db
systemctl start uptime.service
```

## Changing the port

It appears in exactly two places and they must agree:

1. `Environment=NITRO_PORT=` in `/etc/systemd/system/uptime.service`
2. `reverse_proxy 127.0.0.1:` in `/etc/caddy/Caddyfile`

The workflow reads the port back out of the unit for its health check, so it
needs no change. Confirm the new port is free first: `ss -ltnp | grep :<port>`.
