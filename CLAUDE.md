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
                (providers, templates, delivery queue)
  plugins/      Nitro boot hooks: migrations + seeds, then background workers
  utils/        Auto-imported server helpers (database, auth, queries)
shared/         Types, constants and zod schemas used by both sides
i18n/locales/   en.json and de.json, identical key sets
drizzle/        Generated SQL migrations, shipped next to the server output
deploy/         systemd unit and the deployment runbook
.github/        Deploy and image workflows, both triggered by a v* tag
Dockerfile      Container image, plus docker-entrypoint.sh and docker-compose.yml
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

**Naming a monitor.** A bare name only identifies a monitor inside the tree that
surrounds it. Everywhere the tree is not on screen — a widget, a filtered list,
a picker, a dialog, a toast, the delivery log, a notification — the full
breadcrumb is shown instead. `useMonitorPath` resolves it from the group cache
(from the groups alone, not from `useMonitorTree`, so a row is not rebuilt on
every check result), `MonitorPathLabel` draws it with the groups dimmed ahead of
the name, and `joinMonitorPath` in `shared/utils/group.ts` is the one place the
separator lives. The label lets the groups shrink long before the name does:
the name is what the reader scans for, the path only tells two of the same name
apart. The exceptions are the sidebar and the grouped monitor list, where the
surrounding tree or the section heading already spells the path out — that is
what `MonitorCard`'s `showGroupPath` turns off. Notifications keep their own
separator in `server/services/notifications/format.ts`, since a subject line is
not a list row.

How much of the path is worth the space is the reader's call:
`shortenMonitorPath` cuts it to `full`, `parent`, `initials` or `name`, offered
from the sidebar footer and the settings page. Only monitor *labels* follow it —
the group tree, the section headings and the pickers always name themselves in
full, because there the path is the thing being chosen rather than a label on
something else. Tooltips and every search stay on the whole path too — the
setting decides how much fits in a row, not what can be read or found — which is
why both searches below feed on `fullMonitorPath` rather than on the label they
draw.

**Searching monitors.** `shared/utils/search.ts` is the one matcher, used by the
monitor list and by the widget picker. `fuzzyScore` answers whether a record
matches and how well, over as many fields as the caller passes — the breadcrumb
and the target — and `highlightSegments` says which pieces of one string to
mark, which is what `AppHighlight` renders.

A word is tried as a plain substring first, because that is what people type,
and it scores above the scattered fallback and highlights unbroken. A scattered
match has to *start* at a word boundary; without that anchor a three letter
query finds a letter in the middle of every other name. Several words all have
to match but may land in different fields, so `prod nuxt.com` finds a monitor by
its group and its URL at once.

Scoring ranks the widget picker, where the closest match belongs at the top. The
monitor list keeps tree order instead — its sections are the group tree, and
relevance cannot reorder that. Highlighting never vetoes: a row found through
its URL still shows its name unmarked, and a query that only matched across
fields (`pwnuxt` against `Production / Web / Nuxt`) marks nothing at all,
because no single string on screen contains it.

The value lives in `useState` rather than in a preference read per caller.
`useCookie` builds a fresh ref on every call, and two of them only agree where
the browser has a `cookieStore`, so a breadcrumb drawn once per row would go
stale the moment the setting changed. `useMonitorPathPreference()` binds that
one state to its cookie and is called once, from the dashboard layout.

`assertValidParent` in `server/utils/groups.ts` is the guard: it rejects a
missing parent, a group nested into its own subtree, and any move that would
push the deepest leaf past the depth cap. Deleting a group never deletes what it
holds; `deleteMonitorGroup` lifts subgroups and monitors to the parent first.
The tree is small, so these walks run in memory instead of as recursive CTEs.

**Read endpoints.** Besides the monitor routes there is `/api/stats/uptime` for
uptime over many monitors in one query (an SLA table would otherwise issue one
request per row), `/api/monitors/:id/daily` for the calendar's day buckets, and
`/api/incidents`. All three are public like the rest of the read side.

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

**Maintenance.** A monitor can be taken out of the judging without being turned
off. Two things put it there, and they are edited in two different places
because they are two different kinds of thing.

A **recurring window** is configuration: a row in `maintenance_windows` naming
exactly one target — `monitor_id` or `monitor_group_id`, never both — plus the
weekdays, the start minute and the length. Windows are managed centrally, from
`app/pages/settings/maintenance.vue`, not from inside the record they point at:
a schedule that covers a branch is a statement about the instance, and a list of
them all in one place is the only view that answers "what is planned". The
monitor and group forms know nothing about them.

A **manual switch** is an action, so it stays on the thing it acts on:
`maintenance_started_at` plus `maintenance_until` on `monitors` and on
`monitor_groups`, flipped from the row's own menu, with a null `until` meaning
"until somebody turns it off".

Unlike the notification assignment, all of it **adds up**: a window on a root
group and one on a single monitor are both in force, because suppressing an
alarm is not a decision that competes with another. There is no `inherit` mode
here for that reason. A window carries a `note` rather than a name — it is
recognised by its rhythm, its time and its target, all three of which the list
shows, so a name would be a second identity to keep in step with the first.

The start is edited with `UInputTime`, which follows the interface language
through the `locale` `app.vue` already hands `UApp`: German renders `03:00`,
English `3:00 AM`. A window is stored as a minute of the day, so the field is
bridged to a `Time` in the form and back. `formatTimeOfDay` in `useFormatters`
is what labels it and what the list draws; it pads on a 24 hour clock and does
not on a 12 hour one, which is the convention the field's own segments use —
the two sit next to each other and have to agree character for character.

What a window does is *freeze the state machine* rather than feed it a different
answer. `recordCheckResult` still runs the check and still writes the heartbeat
with its raw `status`; it only sets `reported_status` to `maintenance` and leaves
`status`, `consecutive_failures`, `consecutive_successes` and `status_changed_at`
holding what they held when the window opened. Three things follow from that one
rule, and none of them needs a branch of its own:

- no transition happens, so `buildNotificationEvent` finds nothing to report —
  the notification side knows nothing about maintenance;
- a monitor that was up enters the window with a failure count of zero, so once
  the window closes the retries are counted from the start and a server that is
  still booting gets its full tolerance;
- a monitor that was already down and announced stays down underneath, so its
  recovery is still delivered when it finally answers again.

Certificate warnings are deliberately not suppressed. The event fires on the one
check where the expiry first crosses into the warning window; swallowing it there
would lose it for good.

`monitor_state.status` therefore only ever holds `up`, `down` or `pending` —
that is the `EvaluatedMonitorStatus` type. `paused` and `maintenance` are added
when the row is *read*, by `serializeMonitorState`, from `monitors.active` and
from the resolved windows. Maintenance is resolved rather than stored so the
answer follows the clock instead of the last check: a monitor on an hourly
interval would otherwise enter and leave its window up to an hour late. The
browser does not recompute it — `useLive`'s reconcile refetches the list every
minute, which is the resolution a schedule written in whole minutes has anyway.

`shared/utils/maintenance.ts` is the rule. `maintenanceChain` walks the monitor
and its ancestors, `resolveMaintenance` answers for one instant, and
`nextWindowStart` finds the next opening. A window is a statement about the wall
clock, so `zonedClock` reads the local weekday and minute through `Intl` and the
comparison happens there — no offset arithmetic, and a DST change needs no
special case. The zone is one instance-wide setting
(`SETTING_KEYS.maintenanceTimeZone`, default `Europe/Berlin`), served publicly by
`/api/maintenance/settings` because the forms need it to draw a window.
`server/utils/maintenance.ts` supplies the walk with rows;
`app/composables/useMaintenance.ts` supplies it with the group cache, which is
what lets the maintenance widget say when the next window opens using the very
rule the scheduler will apply.

The figures exclude it. `reported_status <> 'maintenance'` is the filter in the
raw branches of `calculateUptimeBulk`, `getMonitorStatsSeries` and
`listIncidentsFromHeartbeats`; for every longer range the exclusion is already
baked into `monitor_stats_hourly`, whose `maintenance_count` the aggregation job
fills instead of `up_count`/`down_count`. That one `case` carries it into the
uptime, the latency chart, the calendar and the incident reconstruction at once.

**Data retention.** `server/services/maintenance.ts` runs every five minutes. It
rolls heartbeats into `monitor_stats_hourly` (recomputing the current, still open
hour every time) and then prunes both tables according to the retention config.
Queries for ranges up to 24 h read raw heartbeats, longer ranges read the hourly
rollups — see `RAW_HEARTBEAT_RANGE_LIMIT_SECONDS`. It also clears manual
maintenance switches that have run out; nothing depends on that, since
`isOverrideActive` compares against the clock, but it keeps the rows from
reporting a maintenance that ended last week.

**Incidents.** Nothing records an outage; `server/utils/incidents.ts`
reconstructs them per request with a gaps-and-islands query over the check
history, and `/api/incidents` returns both the list and the reliability figures
over the same window. A run of failed checks only counts once it is longer than
the monitor's `retries`, which is exactly when the application itself calls the
monitor down and notifies about it.

Raw heartbeats resolve an outage to the check, but they are only kept for
`retention.heartbeatDays`, so a longer window falls back to the hourly rollups and
reports `approximate: true`. There a bucket is not an hour of downtime but an
hour in which some checks failed, so the duration is summed from the down/total
ratio per bucket rather than rounded up to the hour — otherwise the mean time to
recovery of a three minute outage would be an hour. For the same reason an outage
reaching into the open hour is not called ongoing on its own; the monitor has to
still be down.

**Application shell.** `app/layouts/default.vue` renders `UDashboardGroup` plus a
collapsible, resizable `UDashboardSidebar` holding the navigation and the account
controls. Every page then renders its own
`UDashboardPanel` with a `#header` (a `UDashboardNavbar`, optionally followed by a
`UDashboardToolbar`) and a `#body`. Put the page title and its actions in the
navbar, filters and contextual metadata in the toolbar. Each navbar needs a
`<UDashboardSidebarCollapse />` in its `#leading` slot; the mobile toggle is
rendered by the navbar itself. The sign-in page uses the `auth` layout instead,
because the sidebar is meaningless there.

**Settings.** Three pages under `app/pages/settings/`, split the way the rest of
the application is: `index.vue` holds what is stored in the reader's own browser
and is therefore open to everyone, while `admin.vue` and `notifications.vue`
write to the server and carry the `admin` middleware.

They are reached through the gear in the sidebar footer rather than through
navigation rows, and switched between with `AppSettingsNav` — a
`UDashboardToolbar` each page renders under its own navbar, hiding the two
administrative sections from a reader who cannot open them. Each page still owns
its `UDashboardPanel`, so the notification page keeps its create buttons in its
own navbar; only the section bar is shared. That toolbar is left to scroll
rather than given the truncation treatment the gotcha below describes: three
German section names do not fit a phone, and a tab bar that can be swiped reads
better than three labels cut off mid-word.

A page whose content is narrower than the panel centres it (`max-w-* mx-auto`)
rather than leaving it against the leading edge — all three settings pages do.

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

A setting several components read at once needs the `useState` in front of the
cookie that `useMonitorPathPreference` describes above; the response time chart
has one. `useLatencyChartStyle` holds how it is drawn, and
`useLatencyChartStylePreference()` binds it to its cookie once from the
dashboard layout. The chart reads that state rather than taking props: what is
shown belongs to whoever is looking, not to the page that happens to be drawing.

The one exception is a widget, which may pin a style through `config.style` and
defaults to `inherit` — a dashboard is composed once and read by everybody, so
its author can insist on a look without taking the reader's away everywhere
else.

`serializeWidget` reads legacy `config.spread` values as `config.style` when no
style is set, preserving existing widget choices. The next save stores the new
field. The browser preference uses a new cookie; old series and spread cookies
are ignored, so readers without a new preference start with `average`.

**Drawing the chart.** `LATENCY_CHART_STYLES` is that one setting, and its four
entries are whole charts rather than curves to be combined. The average is
always drawn; `average` draws nothing besides it. Min and max are what the
checks inside one bucket ranged over rather than series of their own, so they
only ever appear as a pair, and the other three styles differ over how that
range is drawn. `band` fills between them and draws both edges as curves,
dropping the average's gradient — two translucent primaries over one another
read as a third shade that means nothing. `ticks` gives every bucket its own
stroke and draws nothing between two of them, which is the honest reading: an
extreme is one check, not a value the monitor held until the next. `neutral`
takes the fill out of the primary colour instead, so the average keeps it.

A widget hands its pinned style down as `chart-style` to distinguish the chart
setting from the native inline `style` attribute.

The axis maximum follows what is drawn, and under a spread style it holds all
but the slowest `SCALE_QUANTILE` of the readings. Scaling to the true peak is
what a chart normally does, but a bucket maximum is a single check: one timed out
request would set the scale for a whole month and press the series flat against
the baseline, which is the one thing the bounds were turned on to avoid. Those
few readings run off the top instead — `yOf` clamps to the edge — and the
tooltip still reports every one of them. With the average alone nothing is cut,
because a bucket average is already a reading over many checks.

**Controls inside a widget.** No widget header offers the reader a setting: the
chart style is a look rather than a reading, so it is chosen in the settings and
pinned in the widget's own form. The machinery for one is still in place.
`DashboardWidgetShell`'s `actions` slot draws a control ahead of the caption and
drops it on a cell narrower than `24rem` instead of squeezing it in, and
`useWidgetEditing` is how a widget learns that it is being arranged rather than
read — provided by the grid in edit mode and by the settings preview — so a
control can step aside where the resize and drag buttons occupy the same corner.
It is an inject rather than a prop: every widget takes the same two props, which
is what lets the grid and the preview render any of them without a branch.

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
its position plus width and height tokens. A plain CSS grid in
`app/components/dashboard/Grid.vue` renders the list on the server, while
Sortable only changes its order in edit mode. Saving is debounced and skipped
when the serialised layout has not changed, which keeps the initial mount from
triggering a write.

`shared/utils/widget.ts` is the registry every part of the feature reads:
`WIDGET_DEFINITIONS` names, per type, the icon, the sizes it allows and the
config fields it uses. `WIDGET_TYPES` and the zod enum derive from its keys, the
settings dialog renders its fields from `fields`, and `widgetConfigForType`
reduces a config to exactly those fields — run by the form, by both write
endpoints and by the seed, so a config can never carry a setting from a type the
widget was changed away from, nor lose one the form happens to have no field for.
`shared/utils/grid.ts` keeps only what the grid itself needs: the size order, the
literal responsive classes and the pixel maths the settings preview measures with.

Adding a widget type means: extend the `WidgetType` union in
`shared/types/dashboard.ts`, add the definition, add the component to the map in
`app/components/dashboard/WidgetBody.vue`, and add the labels to both locale
files. Every widget takes the same two props (`widget`, `monitors`), which is
what lets the grid and the preview render any of them without a branch.

**Fullscreen.** `?fullscreen=1` on a dashboard — a bare `?fullscreen` reads the
same — drops the sidebar, the navbar and the toolbar, and takes the panel's
margin, border and rounding with them, so nothing but the widgets is left. The
mode lives in the URL rather than in a cookie or a ref because the screen it is
meant for has nobody standing in front of it: the address is bookmarked, opened
by a kiosk browser or pushed to a wall panel, and the server then renders the
page without its chrome instead of stripping it after hydration.
`useFullscreen` reads and writes that parameter and is scoped to `/d/`, since
only the dashboard page draws a way back out; `useFullscreenSync`, called once
from the dashboard layout the way `useMonitorPathPreference` is, binds Escape
and the browser's own fullscreen to the flag in both directions. Dropping the
sidebar also drops what used to fill the group cache before the widgets render,
which is why the page awaits `useMonitorGroups()` itself — see the gotcha about
reactive `useAsyncData` keys.

The browser's fullscreen cannot be the same flag: requesting it needs a user
gesture, which an opened URL does not have, so it is asked for alongside the mode
on a click and never awaited — an embedded browser can leave that request pending
forever, and the layout must not hang on a permission it does not need.

**Widget scope.** Aggregate widgets carry a `scope` field: `config.groupId`
covers a node of the monitor tree and everything below it, `config.monitorIds` is
the hand-picked escape hatch, and neither means every monitor. `useWidgetScope`
resolves it against the shared caches and reports `isAll`, which the fetchers use
to send no id list at all — that keeps the request out of the id cap and its
cache key from churning whenever a monitor is added.

**Fixed geometry.** A pulse bar and an uptime calendar keep their bars and
squares at a fixed size — `shared/utils/monitor.ts` and `shared/utils/grid.ts`
hold the pitch and the literal classes that draw it — and let the container
decide how many of them fit rather than how wide each one is. A week is then the
same block and an hour the same bar wherever they are drawn: a dashboard cell,
the monitor list, the detail page.

Both rows are laid out with `flex-row-reverse` and clipped. A reversed row packs
at its start, which is the right edge, so the newest check stays in view and the
oldest run off to the left; `justify-end` would look equivalent but `overflow`
makes the row a scroll container, and an overflowing scroll container flips its
alignment back to the start — clipping the newest instead. The left fade turns
the cut into an edge rather than half a bar.

What follows from that is that neither widget takes a count as a setting.
`MONITOR_HEARTBEAT_HISTORY` keeps enough checks in the shared monitor list to
fill a half width cell. A wider pulse bar measures its row after mount and uses
the public heartbeat endpoint to extend a per-monitor client cache only as far
as that row needs, so polling the list does not carry a full-width history for
every monitor. The calendar's initial request follows its width token so it is
the same on both sides of hydration. After mount it keeps only complete week
columns, plus the newest partial week, and extends the request if a wider screen
can show more. Its day count and average describe the visible days.

List widgets likewise have no row-count setting. `DashboardWidgetList` measures
its body and reads the row height from CSS, including container-query changes,
then renders as many complete rows as fit. Measurements use layout pixels so the
scaled settings preview behaves like the dashboard. `widgetListFetchLimit`
provides an initial render and request bound from the height token; incident
history uses it to avoid fetching rows no cell can show. Old `config.limit`
values are ignored on read and dropped on the next save.
The shell's `list` variant reduces vertical card padding, leaving the row pitch
unchanged so compact, standard and tall lists use their space without squeezing
the text.

**Chart tooltips.** `AppChartTooltip` wraps Nuxt UI's tooltip once per chart,
with its reference following the hovered bucket, day or heartbeat. Its portal
escapes the card's clipping and wraps long readings to the viewport. References
use viewport coordinates, including in the scaled widget preview; never mix a
`getBoundingClientRect()` width with an unscaled `offsetWidth`. The heartbeat
readout is a tooltip at every size, with no hidden or reserved legend row.

**Widget preview.** The settings dialog renders the real widget with the real
data next to the form, at the pixel size the chosen width and height produce on a
1180 px grid, scaled down to fit. Sample data would hide what the reader opened
the dialog to see; rendering at the dialog's own width would show the widget at a
container size it never reaches on a dashboard, and every widget changes its
layout by container size.

**Shared stats.** `app/composables/useStats.ts` holds the fetchers for everything
that is not in the monitor list. They key their `useAsyncData` by content —
monitor and range, or scope and range — never by widget id, so two widgets
showing the same thing share one request. The refetch behind the live stream is
throttled by range: a single check moves a 30 day figure in its fifth decimal but
costs a full aggregate scan either way.

A widget is exactly as tall as its cell, so its body clips and never scrolls.
`overflow-y-auto` turns a single rounding pixel into a permanent scrollbar on
every tile wherever the platform does not draw scrollbars as overlays, and
centred content could not be scrolled into view anyway. Content that stops
fitting has to be dropped at the container width where it does, not left to
overflow: `MonitorCard` hides the target line while its header is stacked, while
hover details use a portal so they stay readable at every width. When you add a
widget or a size, check every combination in `WIDGET_DEFINITIONS` against the
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

Nothing about a particular instance is written into the workflow: the origin
comes from the `NUXT_PUBLIC_APP_URL` repository variable and is required, so a
deploy without it fails before the release is swapped in rather than pointing
the notification links at somebody else's host. Keep it that way — a default here
would be one deployment's address baked into everyone's.

The service runs on Bun, not node, because of `nitro.preset` and `bun:sqlite`,
and `drizzle/` has to ship alongside the build since `migrateDatabase()` reads it
from disk at boot. Everything else — the systemd unit, the Caddy block, the
secrets, the recovery steps — is in `deploy/RUNBOOK.md`.

The same tag also runs `.github/workflows/docker.yml`, which publishes the image
to `ghcr.io/aarongreiner/uptime` for amd64 and arm64. The two are deliberately
separate workflows: one ships to the world, the other to a single host, and
neither failing should hold up the other.

**The container.** `.output` is plain JavaScript and no dependency is a native
module — `bun:sqlite` belongs to the runtime — so the build stage is pinned to
`$BUILDPLATFORM` and only the runtime stage is assembled per architecture.
Building per architecture would run Bun's JIT under QEMU, which is slow and
crashes.

`docker-entrypoint.sh` holds what only Docker needs, so the systemd path keeps
reading plain environment variables. It starts as root to take ownership of a
bind mounted `/data`, then drops to `bun` through `setpriv`. It generates a
`NUXT_SESSION_PASSWORD` into the volume when none is set, which is early enough
because nuxt-auth-utils reads that variable on the first request rather than at
import time. And it derives `NUXT_SESSION_COOKIE_SECURE` from
`NUXT_PUBLIC_APP_URL`: a browser silently drops a `Secure` cookie on an `http://`
origin, so defaulting to `true` there would mean nobody can sign in, while
defaulting to `false` under TLS would drop a real protection. An explicit value
wins over the derivation.

`docker-compose.yml` pins `NUXT_DATABASE_PATH` and `NUXT_MIGRATIONS_DIR` in its
`environment` block, which outranks `env_file`. Without that a copied
`.env.example` would point the database at `./data/uptime.db` inside the
container layer, and the history would vanish on the next upgrade.

## Notifications

Two transports ship: SMTP (`nodemailer`) and Microsoft Teams. Both live in
`server/services/notifications/providers/` and are registered from that folder's
`index.ts`.

**Channels and groups.** A `notification_channels` row is one transport with its
credentials and a fixed language. A `notification_groups` row bundles channels
with the events it reacts to. Monitors point at groups, never at channels, so
one channel can be quiet in one group and loud in another. Groups add up rather
than restrict: a channel reached through a group that wants recoveries gets
them, whatever a second group says.

**Assignment.** `monitors.notification_mode` and `monitor_groups.notification_mode`
are `inherit`, `custom` or `muted`. `custom` and `muted` are decisions and end
the walk up the monitor tree; `inherit` passes it on. Reaching the root
undecided falls back to the groups flagged `is_default`, which is what keeps a
new monitor from being silently unreachable. The decision itself is
`resolveAssignedGroupIds` in `shared/utils/notification.ts`, shared so the
dialog previews exactly what the scheduler will do; `resolveNotificationGroups`
in `server/utils/notifications.ts` builds the chain for it.

**Queue.** The scheduler calls `enqueueNotificationEvent`, which is synchronous
and touches nothing but SQLite: it resolves the groups, deduplicates the
channels and writes one `notification_deliveries` row each. It runs while the
monitor is still in the scheduler's in-flight set, so anything slow there would
stop that monitor from ever being checked again — see the gotchas.

`server/services/notifications/queue.ts` does the delivering, on its own interval
started from `bootstrap.ts`. Each attempt runs against a watchdog, a failure is
retried after 30 s, 2 min and 10 min, and the fourth gives up. The error lands on
the delivery row and on the channel, because a self-hosted instance has nobody
reading stderr. Rows survive a restart, so nothing is lost mid-flight.

A recovery is only queued for a channel that was told about the outage: the last
delivery for that monitor and channel decides. `pruneExpiredData` therefore keeps
the newest row per monitor and channel whatever its age.

**Rendering.** `format.ts` holds what both transports agree on — tone, title,
summary, facts, the link back. The email template is a 600 px table with inline
styles, a hidden preheader (the inbox preview line) and a dark variant behind
`prefers-color-scheme`; the light rendering has to stand on its own, since a fair
share of clients honour neither. The Teams payload is posted to a Power Automate
workflow webhook, in one of two shapes chosen per channel, because the two
workflow actions read different bodies and neither can be guessed:

- `card` builds an adaptive card for "Post card in a chat or channel". It is the
  better looking one and the default, and it has **no preview text at all** — the
  channel list and the activity feed show "Card" or "Preview unavailable"
  depending on who it is posted as. That is the action's own limitation: the
  workflow assembles the message, so nothing in the card JSON reaches the
  preview. `summary` on the envelope and a leading plain `TextBlock` are set
  anyway and neither helps, so do not spend another afternoon on it. Timestamps
  use `{{DATE()}}` so Teams resolves them per viewer, and only the named styles
  `good`, `warning`, `attention` and `accent` exist — there is no brand hex.
- `message` sends `{ type, text }` with a small subset of HTML for "Post message
  in a chat or channel". It gives up the layout and gets a real preview,
  including on a phone. Its timestamp is rendered once, in the channel's zone.

Office 365 connector URLs are rejected: they are retired, and the workflow
actions do not accept the message card format they expect.

Display text goes through `translate()` in `server/utils/i18n.ts`, which reads the
locale files directly — there is no vue-i18n on this side and no browser locale,
the language comes from the channel.

**Secrets.** `/api/notifications/**` requires an admin session for reads too, the
only place that departs from "read endpoints stay public": a channel holds SMTP
credentials, and the Teams workflow URL is itself the permission to post.
`serializeNotificationChannel` strips every key a provider declares in
`secretKeys` and reports `secretsSet` instead, and a `PATCH` without a secret
keeps the stored one. An unknown provider loses its whole config rather than part
of it.

To add a transport: implement `NotificationProvider` (including `secretKeys`),
register it, add its config schema to `shared/utils/validation.ts`, extend
`NOTIFICATION_PROVIDERS` in `shared/utils/notification.ts`, add the branch to
`app/components/notification/ChannelFormModal.vue` and the labels to both locale
files.

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
- `UCard` and `UAlert` both set `overflow-hidden`, which disables the automatic
  minimum size of a flex item. Both are given `shrink-0` in `app.config.ts` so
  they are not squashed inside the panel's flex column — an alert without it
  renders as a single line with its description and actions clipped away. Do not
  remove either.
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
- `enqueueNotificationEvent` must stay synchronous and free of network calls. It
  runs inside `runCheck`, which holds the monitor in the scheduler's in-flight
  set until it returns: a transport that accepts a connection and then goes
  quiet would freeze the very monitor whose outage it is reporting.
- Content in the default slot of `UDashboardPanel` replaces its header and body
  entirely — the named slots are only the fallback. Modals and other siblings
  belong inside `#body`.
- Notification links need `public.appUrl`; it has no sensible default, so an
  unset one drops the link rather than pointing at localhost.
- Widget icons are assembled from the registry at runtime, so they are listed in
  `nuxt.config.ts` like every other dynamic icon name. A new definition whose
  icon is missing from that list renders as nothing in production.
- A `useAsyncData` key assembled from reactive values has a moment with no entry
  behind it: `data` reads `undefined` between the key changing and the request
  for the new key being created. Anything derived from it has to tolerate that,
  and a key that depends on a cache — the widget scopes resolve theirs against
  the group tree — needs that cache awaited before the component renders, or the
  server renders one key and then serialises another.
- A bound parameter has no type affinity in SQLite, so bucket maths needs
  `integerLiteral` — and `signedIntegerLiteral` for a value that may be negative,
  such as the UTC offset the uptime calendar aligns its days to.
- SQLite resolves a name in `group by` against the source columns before the
  output aliases, so a bucket selected `as bucket_start` from a table that has a
  `bucket_start` column groups by the stored value rather than by the bucket, and
  the query silently returns one row per source row. Group and order by the
  expression itself wherever the alias could collide.
