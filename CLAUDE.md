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
- Prefer the existing Nuxt UI components and its semantic colour tokens
  (`text-muted`, `bg-elevated`, `border-default`, `text-success` …) over custom
  colours, so light and dark mode keep working for free.

## Commands

```bash
pnpm dev            # dev server on :3000
pnpm build          # production build into .output
pnpm typecheck      # vue-tsc across app, server and shared
pnpm lint           # eslint, --fix to autofix
pnpm db:generate    # generate a migration after editing the schema
pnpm db:studio      # browse the database
```

Migrations are applied automatically at boot by `server/plugins/00.database.ts`.
`pnpm db:migrate` is only needed for manual runs against a stopped instance.

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
```

## How the pieces fit

**Scheduler.** `server/plugins/10.scheduler.ts` starts one interval. Each tick
selects monitors whose `monitor_state.next_check_at` has passed, runs up to
`scheduler.concurrency` checks in parallel and writes a `heartbeats` row plus the
updated `monitor_state`. An in-flight set prevents a slow check from being queued
twice.

**Check executors** live in `server/services/checks/`. `index.ts` maps a
`MonitorType` to an executor. Adding a type means: add the executor, extend the
`MonitorType` union in `shared/types/monitor.ts`, extend `monitorInputSchema`,
add the branch to `app/components/monitor/FormModal.vue`, and add the labels to
both locale files.

The HTTP executor deliberately uses `node:https` rather than `fetch`: it needs
the peer certificate, per request TLS options and manual redirect control on one
connection. The ping executor spawns the system `ping` binary, because raw ICMP
sockets would require `CAP_NET_RAW`.

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
collapsible, resizable `UDashboardSidebar` holding the navigation, the overall
status card and the account controls. Every page then renders its own
`UDashboardPanel` with a `#header` (a `UDashboardNavbar`, optionally followed by a
`UDashboardToolbar`) and a `#body`. Put the page title and its actions in the
navbar, filters and contextual metadata in the toolbar. Each navbar needs a
`<UDashboardSidebarCollapse />` in its `#leading` slot; the mobile toggle is
rendered by the navbar itself. The sign-in page uses the `auth` layout instead,
because the sidebar is meaningless there.

**Surfaces.** The shell background is one step behind `bg-default` (see the `body`
rules in `main.css`), so cards read as surfaces floating on it. Use plain `UCard`
for content blocks: its `title` and `description` props plus the `outline`
variant give the header, the separator and the body in one go.

**Dashboards.** A dashboard owns widgets; each widget stores a position for all
five breakpoints in `dashboard_widgets.layout`. The grid is `grid-layout-plus`
wrapped by `app/components/dashboard/Grid.vue`, which keeps one layout array per
breakpoint and writes the active one back on `layout-updated`. Saving is
debounced and skipped when the serialised layout has not changed, which is what
keeps the initial mount from triggering a write.

**Validation.** zod schemas in `shared/utils/validation.ts` are the single source
of truth: the same schema drives `UForm` on the client and `readValidatedBody`
on the server. Error messages are message *factories* so they resolve against the
current locale at validation time; `app/plugins/validation.ts` wires the
translator to vue-i18n.

**Auth.** `nuxt-auth-utils` with a sealed session cookie. Exactly one row in
`users`, seeded from the environment on the first boot. `requireAdmin` in
`server/utils/auth.ts` guards every mutation.

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
- `better-sqlite3` is a native module. It is listed in `nitro.externals.external`
  and `vite.optimizeDeps.exclude`; do not bundle it.
- Timestamps are Unix **seconds** everywhere in the database and API. Only
  convert to milliseconds at the edge, when handing a value to `Date` or `Intl`.
- The grid mutates the layout array it is given in place. `Grid.vue` therefore
  keeps the very same array reference in its per breakpoint map; replacing it
  resets the component.
- `UCard` sets `overflow-hidden`, which disables the automatic minimum size of a
  flex item. Cards are given `shrink-0` in `app.config.ts` so they are not
  squashed inside the panel's flex column; do not remove it.
- `UDashboardToolbar` scrolls horizontally by default. Long text in it needs
  `:ui="{ left: 'min-w-0 flex-1' }"` plus truncation, otherwise it scrolls on
  phones instead of shortening.
- `nowInSeconds()` lives in `server/services/scheduler.ts` and is the one clock
  the server uses. Reuse it instead of inlining `Date.now()`.
