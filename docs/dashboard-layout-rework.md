# Dashboard layout rework

Replacing the free-form coordinate grid with an ordered list of tiles sized by
tokens. Dashboards stay individually composable, but the number of things an
admin can get wrong drops from twenty numbers per widget to two choices.

## Why

`grid-layout-plus` gives every widget a full `{x, y, w, h}` for each of five
breakpoints — twenty numbers per widget, of which the admin ever sees the one
belonging to the window they happen to have open. Consequences today:

- `buildDefaultWidgetLayout` guesses the four smaller breakpoints once, at
  creation. The moment someone drags on a narrow window the layouts drift apart
  and nothing brings them back into agreement.
- The grid is client-only (`<ClientOnly>` plus a skeleton fallback in
  `Grid.vue`). It is the one screen in the app that flashes on load, which is
  exactly what the cookie-over-`localStorage` rule elsewhere exists to prevent.
- Heights are a pixel count in disguise (`GRID_ROW_HEIGHT = 40`, free `h`), so
  sizing a widget means feeling for a number.
- `Monitor.vue` derives its dense mode from `widget.layout.lg.h <= 3`. On a
  phone the `lg` layout is not the one being rendered, so the density is simply
  wrong there.
- Free `x`/`y` permits holes, overlapping drags and widgets parked below the
  fold.

## The model

A dashboard is an **ordered list** of widgets. Each widget carries a `position`
and two size tokens, `width` and `height`. A plain CSS grid lays them out in
document order. There are no coordinates and no stored breakpoints.

### Width tokens

The container is `grid-cols-2 sm:grid-cols-6 lg:grid-cols-12`.

| token | `<640px` | `≥640px` | `≥1024px` | reads as |
|---|---|---|---|---|
| `quarter` | 1 / 2 | 3 / 6 | 3 / 12 | four across, two on a phone |
| `third` | 2 / 2 | 3 / 6 | 4 / 12 | three across |
| `half` | 2 / 2 | 6 / 6 | 6 / 12 | two across |
| `twoThirds` | 2 / 2 | 6 / 6 | 8 / 12 | wide, with a third beside it |
| `full` | 2 / 2 | 6 / 6 | 12 / 12 | the whole row |

`quarter` is the only token that keeps two tiles side by side on a phone;
everything else goes full width there. The collapse is a fixed table, not
something an admin configures, so it cannot be broken.

### Height tokens

Rows are a fixed unit — `auto-rows-[68px]` with the existing `gap-4`.

| token | rows | rendered height |
|---|---|---|
| `slim` | 1 | 68px |
| `compact` | 2 | 152px |
| `standard` | 3 | 236px |
| `tall` | 5 | 404px |

The unit is chosen so the spans compose: `tall` equals `standard + compact`, so
a tall chart with a standard card and a compact figure stacked beside it closes
the row exactly.

### Which tokens a widget type may use

Each type declares its allowed sets and its defaults, so a heading can never be
404px tall and a chart can never be squeezed into 68px.

| type | widths | heights | default |
|---|---|---|---|
| `monitor` | all | `compact`, `standard` | `third` / `standard` |
| `uptime-summary` | `quarter`, `third`, `half` | `compact`, `standard` | `quarter` / `compact` |
| `latency-chart` | `half`, `twoThirds`, `full` | `standard`, `tall` | `half` / `standard` |
| `status-overview` | `half`, `twoThirds`, `full` | `compact`, `standard` | `full` / `compact` |
| `heading` | `full` | `slim` | `full` / `slim` |

### Flow

`grid-auto-flow` stays at its default, **not** `dense`. Dense would tidy up the
occasional hole left by a mismatched row, but at the price of visual order
diverging from DOM order — which breaks both the drag-and-drop mental model
("I dropped it here and it went somewhere else") and tab order. Holes are the
admin's to close by reordering. If it ever proves too gappy, `dense` is a
one-word change on the container.

### Widgets adapt to their tile, not to the window

Every widget root gets `@container`. `MonitorCard` and `StatusOverview` already
do this; extending it to the rest is what makes "responsive" fall out for free:
a `half` tile looks right on a desktop and on a phone because it reacts to its
own box. This is what replaces the per-breakpoint layout data — the adaptation
moves from stored configuration into CSS.

## Data model

`dashboard_widgets` drops `layout` and gains three columns:

```ts
position: integer('position').notNull().default(0),
width: text('width').$type<WidgetWidth>().notNull().default('half'),
height: text('height').$type<WidgetHeight>().notNull().default('standard')
```

`shared/types/dashboard.ts` gains `WidgetWidth` and `WidgetHeight` and loses
`GridBreakpoint`, `WidgetPosition` and `WidgetLayout`. `DashboardWidget` loses
`layout` and gains `position`, `width`, `height`.

No data migration: per the decision on this rework, existing widget layouts are
not converted. The generated migration drops the column and adds the new ones
with their defaults; any widget already in a database keeps existing and lands
at its type's default size in `id` order. The demo seed is what has to show the
range of what is possible.

## Work

### 1. Tokens and rules — `shared/utils/grid.ts`

The file keeps its name and is rewritten around the tables above:

- `WIDGET_WIDTHS`, `WIDGET_HEIGHTS` as ordered `as const` tuples — the order is
  what the steppers walk.
- `WIDGET_WIDTH_CLASS` and `WIDGET_HEIGHT_CLASS`, mapping each token to a
  **literal, complete class string** (`'col-span-2 sm:col-span-6 lg:col-span-8'`).
  Not composed at runtime: Tailwind scans source text, so a class assembled from
  fragments is not emitted. This replaces the old gotcha about the mutated
  layout array and belongs in `CLAUDE.md`.
- `WIDGET_SIZE_RULES: Record<WidgetType, { widths, heights, defaultWidth, defaultHeight }>`.
- `clampWidgetSize(type, width, height)` — snaps a stored or submitted size onto
  what the type allows, used by the API and by the form.
- `stepWidgetWidth(type, width, direction)` / `stepWidgetHeight(...)` — one step
  through the allowed set, returning `null` at the ends so a button can disable
  itself.

### 2. Validation — `shared/utils/validation.ts`

- `widgetPositionSchema` and `widgetLayoutSchema` are deleted.
- `widgetInputSchema` gains `width: z.enum(WIDGET_WIDTHS).optional()` and
  `height: z.enum(WIDGET_HEIGHTS).optional()`; omitted means "use the type
  default". The existing `superRefine` for `monitorId` stays.
- `dashboardLayoutSchema` becomes
  `{ widgets: [{ id, position, width, height }] }`, still capped at 200.

### 3. Schema and migration

Edit `server/database/schema.ts` (relative imports for the shared types, as
always there), then `pnpm db:generate`. Confirm the generated SQL in `drizzle/`
does the table rebuild SQLite needs for a dropped column.

### 4. Server

- `server/utils/dashboards.ts`: order widgets by
  `asc(position), asc(id)`; `serializeWidget` returns the new fields.
  `nextFreeRow` is replaced by `nextWidgetPosition(dashboardId)` —
  `max(position) + 1`, or `0` on an empty dashboard.
- `widgets/index.post.ts`: assign `nextWidgetPosition` and the clamped size, so a
  new widget appends to the end.
- `widgets/[widgetId].patch.ts`: accept `width`/`height` through
  `clampWidgetSize`; `position` is not the form's business and stays untouched.
- `[id]/layout.put.ts`: keeps its route and its "one bulk write when the admin
  stops editing" shape, but writes `position`, `width` and `height`.

### 5. The grid — `app/components/dashboard/Grid.vue`

Rewritten as a plain CSS grid. `<ClientOnly>` and the skeleton fallback go away;
the dashboard renders on the server like every other page.

```
<div class="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-4 auto-rows-[68px]">
```

Reordering uses `useSortable` from `@vueuse/integrations` with `sortablejs`,
configured with `handle: '[data-widget-drag]'`, `disabled: !editing` and an
`animation`. `grid-layout-plus` is removed from `package.json`.

Kept from the current component, because it is the right shape already:

- the debounced save (700ms) and the serialised-signature check that skips a
  write when nothing actually changed, which is what stops the initial mount from
  saving;
- the `watch` on `editing` that flushes a pending save when edit mode is left;
- the `onBeforeUnmount` timer cleanup.

Dropped: the per-breakpoint layout map, `onBreakpointChanged`,
`collectWidgetLayout`, and the comment about the array being mutated in place.

### 6. Tile chrome — `app/components/dashboard/WidgetView.vue`

The root gets its width and height classes plus `@container`. The edit overlay
grows from two buttons into a small toolbar, still revealed on hover and on
focus-within:

- a drag handle (`data-widget-drag`, `i-lucide-grip-vertical`);
- width `◀ ▶`, each disabled when `stepWidgetWidth` returns `null`, each
  labelled with the resulting token for screen readers;
- height `▲ ▼`, same;
- the existing settings and remove buttons.

A step mutates the local widget and schedules the same debounced save the drag
uses. Keyboard equivalents on the focused tile — `←`/`→` for width, `↑`/`↓` for
height, `Alt` + `←`/`→` to move it in the order — cover what a mouse-only
sortable cannot.

Size is edited here and only here; `WidgetFormModal.vue` stays about content
(type, monitor, title, range, heartbeat count, level) and simply stops passing
`layout` through. That keeps one control per concept, at the cost of the size
not being reachable from the modal.

### 7. Widgets — `app/components/dashboard/widget/*.vue`

- `Monitor.vue`: `dense` comes from `widget.height === 'compact'` instead of
  `widget.layout.lg.h <= 3`, which fixes the phone case as a side effect.
- `Heading.vue`: laid out for a single 68px row.
- `LatencyChart.vue`, `UptimeSummary.vue`, `StatusOverview.vue`: `@container` on
  the card root and container-query breakpoints for type scale and column counts,
  following what `StatusOverview.vue` and `MonitorCard` already do.

### 8. Demo seed — `server/services/seed.ts`

`buildDemoDashboard` loses its `x`/`row` bookkeeping and appends widgets in
order. The composition is chosen to use every token at least once and to
demonstrate that the height units compose:

| # | widget | width | height |
|---|---|---|---|
| 1 | status overview | `full` | `compact` |
| 2 | heading "Production" | `full` | `slim` |
| 3 | latency chart, main site | `twoThirds` | `tall` |
| 4 | monitor, main site | `third` | `standard` |
| 5 | uptime figure, main site | `third` | `compact` |
| 6 | heading "Infrastructure" | `full` | `slim` |
| 7–10 | monitor × 4 | `quarter` | `compact` |
| 11 | heading "Vendors" | `full` | `slim` |
| 12–13 | monitor × 2 | `half` | `standard` |

Rows 3–5 close exactly (`tall` = `standard` + `compact`), row 7–10 is a clean
four-across that becomes two-across on a phone, and 12–13 shows the two-column
case. `seedDefaultDashboard` stays empty — a fresh install should meet the empty
state, not a preset.

### 9. Locales

New keys in both `en.json` and `de.json`, identical sets:

- `widget.width.{quarter,third,half,twoThirds,full}`
- `widget.height.{slim,compact,standard,tall}`
- `widget.resize.{wider,narrower,taller,shorter}` for the stepper labels
- `widget.reorder` for the drag handle

### 10. Documentation

`CLAUDE.md`, the **Dashboards** section: the grid is tokens plus order, not
coordinates; sizes live in `shared/utils/grid.ts`. In **Gotchas**, the
`grid-layout-plus` mutation note is replaced by the Tailwind literal-class-string
rule.

## Order of work

1. Types, tokens and rules (`shared/`), then validation — everything else
   compiles against these.
2. Schema, `pnpm db:generate`, server utils and endpoints.
3. `Grid.vue` and `WidgetView.vue`, dependency swap.
4. Widget components and their container queries.
5. Seed, locales, `CLAUDE.md`.

Steps 1–2 leave the app broken in between; 3 onwards is verifiable in the
browser. Finish with `pnpm typecheck` and `pnpm lint`, and check a seeded
dashboard at desktop, tablet and phone widths — including that the first paint
is server-rendered, with no skeleton.

## What this gives up

Free vertical placement. A tile's position follows from its order and the sizes
before it, so an arrangement like "two small cards stacked beside a tall chart,
with an unrelated widget beneath them" only works when the order allows it, and
a mismatched row leaves a hole. That is the deliberate trade for a layout that
is one list instead of five coordinate planes.
