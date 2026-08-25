# Uptime — agent guide

A self-hosted uptime monitor. Nuxt 4 + Nuxt UI 4 on the front, Nitro + SQLite on
the back. Read only for everyone, editable by a single admin account.

## Ground rules

- **All code, comments, identifiers, commit messages and documentation are in
  English.** German exists in exactly one place: `i18n/locales/de.json`.
- Every user facing string goes through i18n. Never hardcode display text in a
  component. Add the key to **both** `i18n/locales/en.json` and `de.json`; the
  two files must always have an identical key set.
- Read endpoints stay public. Anything that writes calls `requireAdmin(event)`.
  Hiding a button in the UI is never the authorisation.
- Bun is the package manager and application runtime. Use `bun install`,
  `bun add` and `bun run`; do not introduce npm, pnpm or Yarn lockfiles or
  commands. Package scripts that launch a CLI must force Bun with `bun --bun`,
  because dependency bin files may otherwise select Node through their shebang.
- Prefer the existing Nuxt UI components and its semantic colour tokens
  (`text-muted`, `bg-elevated`, `border-default`, `text-success` …) over custom
  colours, so light and dark mode keep working for free.
- When an icon represents state that can change while its control stays mounted,
  prefer `AppMorphIcon` over swapping a `UIcon` or an `icon` prop. Keep static
  and short-lived icons on `UIcon`; motion must communicate a visible state
  transition rather than decorate the interface.

## Commands

```bash
bun run dev            # dev server on :3000
bun run build          # production build into .output
bun run typecheck      # vue-tsc across app, server and shared
bun run lint           # eslint, --fix to autofix
bun run db:generate    # generate a migration after editing the schema
bun run db:studio      # browse the database
```

Migrations are applied automatically at boot by `server/plugins/bootstrap.ts`.
`bun run db:migrate` is only needed for manual runs against a stopped instance.

## Layout

```
app/            Vue application (pages, components, composables)
  layouts/      `default` is the dashboard shell, `auth` is the bare sign-in frame
server/
  api/          HTTP endpoints, file based routing
  database/     Drizzle schema
  services/     Scheduler, check executors, maintenance, seeding, notifications
  plugins/      Nitro boot hooks: migrations + seeds, then background workers
  utils/        Auto-imported server helpers (database, auth, queries)
shared/         Types, constants and zod schemas used by both sides
i18n/locales/   en.json and de.json, identical key sets
drizzle/        Generated SQL migrations, shipped next to the server output
deploy/         systemd unit and the deployment runbook
.github/        Deploy workflow, triggered by a v* tag
```

## How the pieces fit

**Scheduler.** `server/plugins/bootstrap.ts` starts one interval. Each tick
selects monitors whose `monitor_state.next_check_at` has passed, runs up to
`scheduler.concurrency` checks in parallel and writes a `heartbeats` row plus the
updated `monitor_state`. An in-flight set prevents a slow check from being queued
twice.

**Live updates.** `server/api/events.get.ts` is a server sent event stream, and
`server/utils/live.ts` is the in-process bus feeding it. The endpoint builds the
stream by hand instead of using h3's `createEventStream`, because that helper
signals a dropped connection by rejecting promises the handler cannot reach, and
an unhandled rejection ends the bun process. Whatever writes to a client has to
survive that client disappearing mid frame. `recordCheckResult`
publishes a `monitor.checked` event carrying the new state, the recomputed 24 h
uptime and the heartbeat row it just inserted — the same shape `/api/monitors`
returns, so a browser patches its cache instead of refetching the list.

`app/plugins/live.ts` holds one stream per tab and hands it to
`useLiveMonitors()`, called once from the dashboard layout. Every card, widget,
sidebar entry and status figure reads that one `useMonitors()` cache, so patching
it updates the whole application at once. Anything the payload cannot carry — the
aggregated chart buckets — subscribes through `onMonitorChecked()` and refetches
just itself.

The stream is closed while the tab is hidden, because browsers cap the
connections per origin and background tabs would starve the visible one. Tab
switches therefore disconnect constantly, which is the load the endpoint is
written for. `LIVE_KEEP_ALIVE_MS` must also stay under the runtime's idle
timeout — bun closes a connection after ten seconds of silence — otherwise a
quiet stream is torn down between two pings.
Reopening reports the gap through `onResumed`, which reloads the list; `usePolling`
is only the slow safety net behind that, and it also picks up monitors created
elsewhere. Relative timestamps read `useNow()`, one shared clock ticked every
second by `app/plugins/clock.client.ts`. Both plugins wait for `app:mounted`
before moving anything; the clock also waits for the initial suspense to finish
hydrating, otherwise it rewrites relative timestamps the client is still
comparing.

`/api/status` is there for callers outside the browser. Nothing in the interface
requests it: every figure the application shows is derived from the monitor list.

**Groups.** Monitors are organised in a tree. `monitor_groups.parent_id` is a
self reference, `monitors.group_id` is nullable, and a null group puts the
monitor at the root next to the top level groups. Depth is capped by
`MONITOR_GROUP_MAX_DEPTH` in `shared/utils/group.ts`, which is also where the
tree is assembled: `buildMonitorGroupTree` turns the flat API response into
nodes, `buildMonitorTree` attaches the monitors and rolls the status counts up
towards the roots. Both sides use it — the sidebar through
`useMonitorNavigation`, the list page through `useMonitorTree`.

`useMonitorNavigation` also owns the sidebar tree itself. `AppMonitorNav` renders
it through the recursive `AppMonitorNavList`, not through `UNavigationMenu`,
because that component folds its levels with nested accordions whose state
cannot be read or written from the outside. The rows are plain anchors for the
same reason the fold is ours: the router treats every `/monitors?group=…` link
as active on the bare list route, so `useMonitorNavigation` decides which single
row is current, and revealing the path down to it is derived rather than stored,
so the server renders the tree the browser is about to show. A group folded shut
by hand beats that reveal until the current row moves on. Collapsed to icons the
sidebar has no fold, so that mode hands `collapsedItems` to `UNavigationMenu` and
lets it draw the popovers.

`assertValidParent` in `server/utils/groups.ts` is the guard: it rejects a
missing parent, a group nested into its own subtree, and any move that would
push the deepest leaf past the depth cap. Deleting a group never deletes what it
holds; `deleteMonitorGroup` lifts subgroups and monitors to the parent first.
The tree is small, so these walks run in memory instead of as recursive CTEs.

**Check executors** live in `server/services/checks/`. `index.ts` maps a
`MonitorType` to an executor. Adding a type means: add the executor, extend the
`MonitorType` union in `shared/types/monitor.ts`, extend `monitorInputSchema`,
add the branch to `app/components/monitor/FormModal.vue`, and add the labels to
both locale files.

The HTTP executor deliberately uses `node:https` rather than `fetch`: it needs
per request TLS options and manual redirect control on one connection. The
certificate is not read from that request but by `checks/certificate.ts`, which
opens a TLS connection of its own — see the gotcha below. It runs alongside the
request so it costs no wall clock time, caches a reading for six hours because
certificates outlive any check interval, and reports the certificate of the
configured URL rather than of a redirect target, since that is the handshake the
check itself fails on once it expires. The ping executor spawns the system
`ping` binary, because raw ICMP sockets would require `CAP_NET_RAW`.

**Retries.** A failed check always writes a `down` heartbeat, but the monitor is
only reported as `down` once `consecutive_failures > monitor.retries`. Until then
its state is `pending`. Uptime percentages are computed from raw heartbeats, so
they are not affected by that debouncing.

**Data retention.** `server/services/maintenance.ts` runs every five minutes. It
rolls heartbeats into `monitor_stats_hourly` (recomputing the current, still open
hour every time) and then prunes both tables according to the retention config.
Queries for ranges up to 24 h read raw heartbeats, longer ranges read the hourly
rollups — see `RAW_HEARTBEAT_RANGE_LIMIT_SECONDS`.

**Application shell.** `app/layouts/default.vue` renders `UDashboardGroup` plus a
collapsible, resizable `UDashboardSidebar` holding the navigation and the account
controls. Every page then renders its own
`UDashboardPanel` with a `#header` (a `UDashboardNavbar`, optionally followed by a
`UDashboardToolbar`) and a `#body`. Put the page title and its actions in the
navbar, filters and contextual metadata in the toolbar. Each navbar needs a
`<UDashboardSidebarCollapse />` in its `#leading` slot; the mobile toggle is
rendered by the navbar itself. The sign-in page uses the `auth` layout instead,
because the sidebar is meaningless there.

**Surfaces.** Three stacked levels, deliberately without hard dividing lines: the
shell sits behind everything (the `body` rules in `main.css`), the content panel
floats on it as an inset rounded surface, and cards sit on top of the panel. The
panel treatment lives in `app.config.ts` under `dashboardPanel`, so every page
gets it without repeating classes, and the sidebar drops its trailing border in
the layout. Use plain `UCard` for content blocks: its `title` and `description`
props plus the `outline` variant give the header, the separator and the body in
one go.

The panel is inset on three sides only. Once the sidebar is on screen the panel
drops its leading margin (`lg:ms-0`), because the sidebar's own padding already
holds the gutter: the panel border then lands exactly on the sidebar's edge,
which is the seam the eye reads and the line the resize handle sits on, and the
collapsed rail centres its icons in the strip the reader actually sees. Padding
the sidebar instead would move all three apart again.

Because the panel is inset, its body owns the scrolling: the navbar and toolbar
stay put while the content moves. Anything that needs to stay visible belongs in
the panel header, not at the top of the body.

**Stored interface state.** `useUiPreference` keeps a setting in a cookie, and
everything that survives a reload goes through it or through the cookie storage
of `UDashboardGroup`: the sidebar width and its collapsed flag, the folded
groups, the range on the monitor detail page. Cookies rather than `localStorage`
on purpose — all of it is rendered on the server, and a value that only arrives
after hydration makes the layout jump. Vue does not rectify class or attribute
mismatches during hydration either, so a wrong first render simply stays on
screen. Anything you add here has to be readable while the page is rendered, not
written by an effect afterwards.

**Morphing icons.** `AppMorphIcon` is the shared wrapper around morphicons. It
resolves stable Lucide `IconNode` references from `MORPH_ICONS` in
`app/utils/morph.ts`, applies the project's `snappy` spring and honours the
`useMorphMotion` preference. Use it whenever a badge, button or input stays
mounted while its icon changes — status updates, binary toggles and short-lived
success states are the intended cases. Add new morph participants to the
registry instead of importing Lucide geometry into components. Put the wrapper
in Nuxt UI's `#leading` or `#trailing` slot and apply the slot's icon class so
sizing remains consistent. A custom leading slot replaces `UButton`'s built-in
loading icon, so render and spin the loading state there when needed.

Do not morph static navigation or type icons, toast icons, dropdown items that
unmount on selection, or disclosure chevrons that already rotate cleanly with
CSS. Keep labels on the surrounding control when it is interactive; otherwise
pass an i18n-translated `label` to `AppMorphIcon`. Any initial icon must remain
SSR-safe: client-only state may change it only after hydration.

**Dashboards.** A dashboard owns an ordered list of widgets. Each widget stores
its position plus width and height tokens; the allowed sizes and their literal
responsive CSS classes live in `shared/utils/grid.ts`. A plain CSS grid in
`app/components/dashboard/Grid.vue` renders the list on the server, while
Sortable only changes its order in edit mode. Saving is debounced and skipped
when the serialised layout has not changed, which keeps the initial mount from
triggering a write.

A widget is exactly as tall as its cell, so its body clips and never scrolls.
`overflow-y-auto` turns a single rounding pixel into a permanent scrollbar on
every tile wherever the platform does not draw scrollbars as overlays, and
centred content could not be scrolled into view anyway. Content that stops
fitting has to be dropped at the container width where it does, not left to
overflow: `MonitorCard` hides the target line while its header is stacked, and
`MonitorHeartbeatBar` hides the legend below the same width. When you add a
widget or a size, check every combination in `WIDGET_SIZE_RULES` against the
shortest row height (`lg:auto-rows-[60px]`).

**Validation.** zod schemas in `shared/utils/validation.ts` are the single source
of truth: the same schema drives `UForm` on the client and `readValidatedBody`
on the server. Error messages are message *factories* so they resolve against the
current locale at validation time; `app/plugins/validation.ts` wires the
translator to vue-i18n.

**Auth.** `nuxt-auth-utils` with a sealed session cookie. Exactly one row in
`users`, seeded from the environment on the first boot. `requireAdmin` in
`server/utils/auth.ts` guards every mutation.

**Deployment.** A `v*` tag runs `.github/workflows/deploy.yml`: build with Bun,
upload `.output/` and `drizzle/` to a staging directory, back up the SQLite file,
swap both folders, restart `uptime.service` and poll `/api/health` — a build that
never answers is rolled back to the previous one. `data/` and the `.env` rendered
from the repository secrets stay put across releases.

The service runs on Bun, not node, because of `nitro.preset` and `bun:sqlite`,
and `drizzle/` has to ship alongside the build since `migrateDatabase()` reads it
from disk at boot. Everything else — the systemd unit, the Caddy block, the
secrets, the recovery steps — is in `deploy/RUNBOOK.md`.

## Notifications

No transport ships yet, but everything around it does: the
`notification_channels` and `monitor_notification_channels` tables, the
`NotificationProvider` contract, the registry, and a `dispatchNotificationEvent`
call in the scheduler that fires on `monitor.down`, `monitor.up` and
`monitor.certificate-expiring`.

To add one:

1. Implement `NotificationProvider` in
   `server/services/notifications/providers/`.
2. Register it from `registerBuiltinNotificationProviders()` in that folder's
   `index.ts`.
3. Add CRUD endpoints for channels and a management screen, plus locale keys.

Delivery failures must stay contained: a broken transport may never break a
check. The dispatcher logs and swallows.

## Gotchas

- `server/database/schema.ts` imports shared types with **relative** paths.
  drizzle-kit bundles that file outside of Nuxt, so the `#shared` alias is not
  available there.
- SQLite uses Bun's built-in `bun:sqlite` driver through
  `drizzle-orm/bun-sqlite`; do not reintroduce a Node-native SQLite package.
- Timestamps are Unix **seconds** everywhere in the database and API. Only
  convert to milliseconds at the edge, when handing a value to `Date` or `Intl`.
- Widget width classes in `shared/utils/grid.ts` must stay complete literal class
  strings. Tailwind does not emit class names assembled from fragments at
  runtime.
- `UCard` sets `overflow-hidden`, which disables the automatic minimum size of a
  flex item. Cards are given `shrink-0` in `app.config.ts` so they are not
  squashed inside the panel's flex column; do not remove it.
- `UDashboardToolbar` scrolls horizontally by default. Long text in it needs
  `:ui="{ left: 'min-w-0 flex-1' }"` plus truncation, otherwise it scrolls on
  phones instead of shortening.
- `nowInSeconds()` lives in `server/services/scheduler.ts` and is the one clock
  the server uses. Reuse it instead of inlining `Date.now()`.
- Bun emits `close` on a `node:http` `ClientRequest` as soon as the response
  headers arrive, not when the response body ends, and destroying an
  `IncomingMessage` makes it emit `end` rather than an error. Anything that
  wraps a request in a promise has to keep its deadline running past `close` and
  settle before it destroys anything, or a stalled body resolves as a success —
  or never settles at all.
- A check that never settles does not just lose one result: the scheduler holds
  the monitor in its in-flight set until the promise returns, so that monitor
  silently stops being checked until the process restarts. `executeCheck` puts a
  watchdog around every executor for that reason; an executor still has to
  enforce its own timeout, the watchdog is only the net.
- Bun's `node:https` is backed by its native HTTP client, so there is no TLS
  socket to reach: `response.socket` is a plain `net.Socket`, a custom
  `createConnection` is ignored (as it is on node whenever `agent` is set, which
  `agent: false` also does), and `getPeerCertificate` exists nowhere. Reading a
  peer certificate means opening the connection with `node:tls` instead, which
  behaves identically on both runtimes.
- An unhandled promise rejection terminates the bun process, and systemd restarts
  it: every request in that window becomes a 502 behind Caddy.
  `server/plugins/errors.ts` logs and swallows them so a single dropped browser
  cannot stop the checks, but anything it prints still has a cause to remove.
- A page that turns every failed request into a 404 lies during a restart. Only
  a 404 from the server means the record is gone; see `app/pages/d/[slug].vue`.
