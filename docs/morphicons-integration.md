# morphicons integration plan

A plan for adopting [morphicons](https://www.morphicons.com) —
[`guillermolg00/morphicons`](https://github.com/guillermolg00/morphicons), MIT,
v1.7.0 — across the application.

## What the library is

morphicons animates a stroke-based icon into any other stroke-based icon. It
solves the optimal similarity between the two shapes in closed form (2D
Procrustes) and interpolates in polar space, so a rotation is never declared by
hand: `arrow-right → arrow-down` yields θ = 90° on its own. Zero runtime
dependencies, ~8 KB gzip for the Vue binding, one global `requestAnimationFrame`
for every instance on the page, and sub-millisecond planning per pair.

Three usage modes, all on one component:

| mode | props | when |
|---|---|---|
| uncontrolled | `icon` | 90 % of uses — change the prop, it animates |
| controlled | `from`, `to`, `progress` | gestures, scrubbing; no spring |
| imperative | template ref → `morphTo()` / `set()` | sequences |

Spring presets: `smooth` (critically damped), `snappy` (fast, slight overshoot),
`bouncy`. Morphs are interruptible — a `morphTo` mid-flight re-plans from the
current intermediate shape and preserves velocity, so click spam never jumps.

Everything below uses uncontrolled mode. Nothing in this application needs a
scrubber or a sequence.

## Why it fits this codebase

The `MorphIcon` Vue binding server-renders the exact static SVG for the current
icon and only starts a runtime on hydration. That matters here more than usual:
CLAUDE.md rules out anything that moves before `app:mounted`, because Vue does
not rectify attribute mismatches during hydration and a wrong first render just
stays on screen. morphicons has no first-paint cost to rectify.

The second fit is thematic. This application is a live view onto state
transitions — `recordCheckResult` publishes `monitor.checked` over SSE, the
browser patches its `useMonitors()` cache, and every card, badge and sidebar row
re-reads it. Today a monitor going down swaps one icon for another between two
frames. That transition is exactly what the library exists to draw.

## Decisions taken

1. **Rendering: `MorphIcon` in component slots.** Not the `maskTarget` adapter.
2. **Scope: full, including restructuring** — existing toggles, three new
   features from the showcase, and structural changes where they unlock a morph.
3. **Icon data: the `lucide` npm package**, alongside the existing
   `@iconify-json/lucide`.
4. **Reduced motion: a user setting**, defaulting to following the OS.

### Why slots and not `maskTarget`

Nuxt UI 4 does not render icons as inline SVG here. Every `UIcon` becomes a
CSS-mask span:

```html
<span class="iconify i-lucide:layout-dashboard shrink-0 size-5" aria-hidden="true"></span>
```

```
mask-image:       url("data:image/svg+xml,%3Csvg …%3E")
mask-size:        100% 100%
background-color: currentColor
```

There are 59 of these on the dashboard route alone. morphicons ships
`maskTarget` precisely for this shape: it builds a hidden pair of referenced
`<svg><mask><path>` buffers, points the element's mask at them and writes `d`
into real geometry, so the span morphs in place and keeps its `size-*` and
`text-*` classes. It would let us morph icons that Nuxt UI renders internally,
with no markup change at all.

We are not taking it, because the cost is real and the library says so plainly:
a mask element makes the browser re-rasterize the mask and repaint the masked box
every frame, on the main thread, with no compositor-only path — fine for toggles
and short lists, wrong for icon-heavy views, which is exactly what a monitor
dashboard is. The inline-SVG bindings get the cheapest possible write.

The slot route is viable because the components we need all expose the seam.
Verified in `node_modules/@nuxt/ui/dist/runtime/components/`:

| component | slot | source |
|---|---|---|
| `UButton` | `#leading`, `#trailing` | `Button.vue:136,147` |
| `UBadge` | `#leading`, `#trailing` | `Badge.vue:47,58` |
| `UInput` | `#leading`, `#trailing` | `Input.vue:146,153` |
| `UDropdownMenu` | `#item-leading` (or `#{item.slot}-leading`) | `DropdownMenuContent.vue:103` |

Note that a `#leading` slot **replaces** the default content of that slot,
including the loading spinner `UButton` would otherwise draw for `:loading`. See
the check-now item below.

### Why the `lucide` package

morphicons consumes geometry, not CSS class names: either a raw `d` string or an
`IconNode` (`[tag, attrs][]`). `@iconify-json/lucide` ships a single ~1 MB
`icons.json` with no per-icon entry points, so pulling geometry from it means a
build-time extraction step, and its Lucide bodies carry a `<g>` wrapper whose
acceptance by `svgToIcon` would have to be verified first.

`bun add lucide` gives named `IconNode` exports that tree-shake to the ~20
icons that actually morph, with stable module-scope references — which is what
keeps morphicons' `WeakMap` plan cache warm. Same upstream geometry as
`@iconify-json/lucide`, so there is no visual drift between a morphing icon and
the static `UIcon` next to it.

`@iconify-json/lucide` stays and keeps serving every static icon. Only morph
pairs get `MorphIcon`.

### Visual parity

The swap is lossless. `MorphIcon` renders:

```
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
  <path d="…" />
</svg>
```

Identical presentation to the Lucide mask bodies Nuxt UI injects. `color`
defaults to `currentColor`, so `text-*` classes keep working unchanged.

**Sizing rule:** the `size` prop writes `width`/`height` *attributes*, which a
Tailwind `size-*` class overrides (CSS beats presentation attributes). So keep
sizing in classes exactly like the rest of the codebase — `class="size-5"`, never
`:size="20"`. Consistent with every existing `UIcon` call site.

## Foundation

### 1. Dependencies

```bash
bun add morphicons lucide
```

`morphicons` declares `vue >=3.3` as an optional peer; nothing else is needed.

### 2. `app/utils/morph.ts` — the icon registry

Auto-imported like `app/utils/monitor.ts`. Exports **one** object rather than
re-exporting the Lucide names, because `app/utils/` is auto-imported and globals
called `X`, `Check`, `Play` would be a collision waiting to happen.

```ts
import { Check, CircleCheck, CirclePause, CircleX, /* … */ } from 'lucide'
import type { IconNode } from 'morphicons/vue'

/** The icons that take part in a morph. Module scope on purpose: morphicons
 *  caches its plans in a WeakMap keyed by the IconNode reference. */
export const MORPH_ICONS = { check: Check, circleCheck: CircleCheck, /* … */ } satisfies Record<string, IconNode>

export type MorphIconName = keyof typeof MORPH_ICONS
```

Plus the status mapping, mirroring the existing `monitorStatusIcon`:

```ts
/** Morph counterpart of `monitorStatusIcon` in shared/utils/monitor.ts.
 *  Kept here rather than there: `shared/` is imported by the server, and the
 *  icon geometry has no business in the Nitro bundle. */
export function monitorStatusMorphIcon(status: MonitorStatus): MorphIconName { … }
```

The duplication with `shared/utils/monitor.ts:52` is deliberate and should carry
that comment — the alternative drags `lucide` into the server build.

### 3. `app/components/AppMorphIcon.vue` — the wrapper

One place for policy, and a call site that reads like `UIcon`:

```vue
<AppMorphIcon name="circleCheck" class="size-5" :label="$t('…')" />
```

It resolves `name` through `MORPH_ICONS`, applies the project default spring
(`snappy` — fast with a subtle overshoot, the right character for UI toggles),
and feeds it the reduced-motion policy from the composable below. `label` goes
through `$t` at the call site, per the i18n ground rule; without it the icon is
`aria-hidden`, matching `UIcon`.

### 4. `app/composables/useMorphMotion.ts` — the preference

```ts
type MorphMotion = 'system' | 'on' | 'off'   // → morphicons 'user' | 'never' | 'always'
```

Stored with `useUiPreference('morph-motion', () => 'system', isMorphMotion)`, so
it is a cookie and is readable while the page renders — the rule CLAUDE.md sets
for all stored interface state.

Default `system` maps to morphicons' `"user"`, which honours
`prefers-reduced-motion`. Note this is *not* the library default: since 1.4.2
morphicons animates regardless of the OS setting, on the argument that icon
morphs are short communicative micro-transitions. Following the OS is the safer
default for an operations tool that people keep open all day.

### 5. Settings surface

A third field in the "Appearance" card of `app/pages/settings.vue`, next to the
existing theme and language selects, built the same way as `themeItems`
(`settings.vue:25`) so the three read as one group.

New i18n keys in **both** `i18n/locales/en.json` and `de.json` — the two files
must keep an identical key set:

```
settings.iconMotion
settings.iconMotionOption.system | .on | .off
```

## Where to use it

Ranked by payoff over effort. File references are current as of this plan.

### Tier 1 — free wins (the element already stays mounted, only a prop changes)

#### 1.1 Monitor status badge — the signature use

`app/components/monitor/StatusBadge.vue:22` — move the `:icon` prop into a
`#leading` slot holding `<AppMorphIcon :name="monitorStatusMorphIcon(status)">`.

This is the highest-value change in the plan, for three reasons:

- **Reach.** `MonitorStatusBadge` is rendered by `monitor/Card.vue:53`, the
  detail navbar (`monitors/[id].vue` `#trailing`) and the monitor widget. One
  edit lights up every status indicator in the application.
- **No wiring.** SSE already patches `useMonitors()`; the badge stays mounted and
  its `status` prop changes. Uncontrolled mode needs nothing else.
- **The geometry is ideal.** `circle-check`, `circle-x`, `circle-pause` and
  `loader-circle` all share an outer circle on the 24 grid. Procrustes will hold
  the circle still and morph only the inner glyph, so a monitor going down reads
  as the check unfolding into a cross rather than as a swap.

Two details to handle:

- `pending` currently spins through `:ui="{ leadingIcon: 'animate-spin' }"`
  (`StatusBadge.vue:24`). That `ui` override no longer applies once the icon
  comes from a slot — put `animate-spin` on the `AppMorphIcon` class instead.
  The spin is a CSS transform and the morph writes `d`; they do not fight. The
  rotation does snap back to 0° when leaving `pending`, so consider dropping the
  spin altogether now that the morph itself signals the transition.
- Add `transition-colors` alongside, so the `monitorStatusColor` change and the
  shape change move together instead of the colour jumping ahead.

#### 1.2 Sidebar fold-all

`app/components/AppMonitorNav.vue:42` — `chevrons-up-down ↔ chevrons-down-up`.

A near-perfect pair: the two chevrons are congruent under a 180° rotation about
their own centroids, which is exactly the case morphicons runs per subpath. It
will read as the two arrows flipping to face each other. One `UButton`, one
`#leading` slot.

#### 1.3 Dashboard edit-mode toggle

`app/pages/d/[slug].vue:116` — `pencil-ruler ↔ check`, currently a ternary on the
`icon` prop. Genuinely different shapes, so this is a real morph rather than a
rotation, and the button never unmounts.

#### 1.4 Pause / resume on the detail page

`app/pages/monitors/[id].vue:127` — `play ↔ pause`. Showcase demo #4, and the
same ternary shape as above.

**Do not** do the same to `app/pages/monitors/index.vue:172`. That is a dropdown
item; the menu closes on select and the item unmounts, so the morph is never on
screen. Leave it as an `icon` prop.

### Tier 2 — small restructuring, clear payoff

#### 2.1 Theme toggle → `app/components/AppColorModeButton.vue`

`app/layouts/default.vue:126` and `app/layouts/auth.vue:18` use
`UColorModeButton`. Its implementation renders **two** `UIcon`s and hides one
with `dark:hidden` / `hidden dark:inline-block`
(`components/color-mode/ColorModeButton.vue`) — which is verbatim what the
morphicons showcase calls out: sun to moon in one slot, no double SVG, no CSS
swap.

Replace it with a thin local component: a `UButton` with a `#leading` slot and
one `AppMorphIcon`, over the `useColorMode()` composable the settings page
already uses (`settings.vue:10`).

Nuxt UI supplies its own `aria-label` from its internal locale
(`colorMode.switchToLight` / `switchToDark`). Our replacement must supply it
through `$t`, so two new keys in both locale files.

#### 2.2 Check-now settles into a check

`app/pages/monitors/[id].vue:119` with `app/composables/useMonitorActions.ts:9` —
`refresh-cw → check → refresh-cw`. The showcase's flagship pattern ("the most
repeated swap in real apps: Copy settles into Check") applied to this
application's most-used action.

`checkNow` already tracks `pending`; add a short-lived `succeededId` ref that
clears after ~1.2 s and drive the icon name off it.

**Gotcha:** this button also uses `:loading`. `UButton` draws its spinner *inside*
the `#leading` slot's default content, so providing the slot removes it. The
slot has to render the loading state itself — either keep `AppMorphIcon` and add
`animate-spin` while pending, or render `UIcon` with `appConfig.ui.icons.loading`
in that branch.

#### 2.3 Copy the monitor target — new feature

Showcase demo #1, and a genuinely useful addition: there is currently no way to
copy a monitor's URL or hostname out of the interface.

Add a copy button next to the target in the detail toolbar
(`app/pages/monitors/[id].vue:161`), morphing `copy → check` and settling back
after ~1.5 s. Use `navigator.clipboard.writeText` directly rather than pulling in
`@vueuse/nuxt` for `useClipboard` — it is five lines and no new dependency.

New i18n keys for the label and the "copied" state, both locales.

#### 2.4 Password visibility — new feature

Showcase demo #2. `app/pages/login.vue:86` and `app/pages/settings.vue:160,173`
are plain `type="password"` inputs with no reveal. Nuxt UI only builds one into
`UAuthForm`, which this application does not use.

Write `app/components/AppPasswordInput.vue` once — a `UInput` with a `#trailing`
slot holding a ghost `UButton` and an `AppMorphIcon` on `eye ↔ eye-off` — and use
it in all three places. Toggle `type` between `password` and `text`, keep
`aria-pressed` and an `$t` label on the button.

New i18n keys for show/hide, both locales.

### Tier 3 — optional, weigh before doing

#### 3.1 Grouped / flat view toggle

`app/pages/monitors/index.vue:296-319` is a `UButtonGroup` of two buttons
(`folder-tree`, `layout-grid`) with the active one styled `primary`/`subtle`.
Morphing requires collapsing it into a single toggle button.

Ranked low on purpose: two buttons communicate "two options, one of them
active" more explicitly than a single morphing toggle, and `aria-pressed` on two
controls is clearer than on one. This is a UX call, not a technical one, and the
current control is not broken. If you take it, it is a small diff; if you skip
it, nothing else in the plan depends on it.

#### 3.2 Inline validation icons

Showcase demo #5. `UForm` + zod is already the single source of truth
(`shared/utils/validation.ts`), so per-field validity is available from the form
context. A trailing `check ↔ x` on the URL and hostname fields in
`app/components/monitor/FormModal.vue` would be the natural target.

The most invasive item here: it needs per-field validity plumbing that does not
exist yet, and it changes form behaviour, not just decoration. Worth doing last,
if at all.

#### 3.3 Sidebar collapse button — partially blocked

`UDashboardSidebarCollapse` appears in every page navbar and swaps
`panel-left-close ↔ panel-left-open`
(`components/DashboardSidebarCollapse.vue:56`). It would be a good morph.

It is blocked cleanly, though: the component forwards no slots to its inner
`UButton`, and the collapsed state comes from `useDashboard`, a reka-ui
`createContext` in `@nuxt/ui/dist/runtime/utils/dashboard` that is **not**
publicly exported. Two ways through, both with a cost:

- Deep-import the internal path. Works today, breaks on any Nuxt UI release that
  moves the file.
- Track the state through the public `dashboard:sidebar:collapse` Nuxt hook that
  `DashboardGroup.vue:41` calls, and re-implement the button.

Recommendation: leave it alone unless the rest of the plan lands and this becomes
the one static icon that stands out.

## Where **not** to use it

Listing these is part of the plan — a morph in the wrong place is worse than no
morph, and each of these looks tempting.

- **The group disclosure chevron**, `app/components/AppMonitorNavList.vue:83-93`.
  It already rotates through a CSS `rotate-180` with a 200 ms transition, which
  is cheaper and smoother than re-planning geometry. The morphicons showcase
  keeps the chevron in its own file-tree demo CSS-based for the same reason.
- **Toast icons**, e.g. `useMonitorActions.ts:16,48`, `settings.vue:66`,
  `login.vue:36`. A toast mounts with its final icon; there is nothing to morph
  from. The library documents this: the first icon paints without animating.
- **Dropdown menu items that close on select** — `monitors/index.vue:164-217`,
  `d/[slug].vue:77-86`. The element unmounts before the morph could be seen.
- **Static icons** — navigation entries, `monitorTypeIcon` (a monitor's type
  effectively never changes), empty-state and page-header icons, widget action
  icons (`WidgetView.vue:24,32`). No state change, no morph.
- **`AppLogo.vue`** — a hand-drawn SVG with a `rect` and fills on a 32 grid, not a
  stroke icon on the 24 grid. Outside the library's contract.

## Risks and verification

- **Bundle.** `morphicons/vue` measures 8.04 KB gzip (CI-gated by the project),
  plus ~20 tree-shaken `IconNode`s at a few hundred bytes each. Negligible next
  to Nuxt UI.
- **Performance.** One global rAF drives every instance; a settled morph
  unregisters itself. Nothing here morphs more than a handful of icons at once,
  and the status badge case is one `d` write per changed monitor.
- **Typecheck and lint.** `bun run typecheck` and `bun run lint` must stay green;
  `IconInput` / `IconNode` types come from `morphicons/vue`.
- **i18n parity.** Every new key must land in `en.json` *and* `de.json`. The two
  files must always have an identical key set.
- **Verifying live status morphs.** The in-app browser preview reports
  `visibilityState: hidden`, which switches off the visibility-gated SSE stream —
  status morphs driven by real check results will not fire there and will look
  broken. Verify by toggling a monitor's pause state (a direct prop change) or in
  a real browser tab.

## Suggested order

| phase | contents | unlocks |
|---|---|---|
| 0 | deps, `app/utils/morph.ts`, `AppMorphIcon`, `useMorphMotion`, settings field + locale keys | everything below |
| 1 | status badge, fold-all, dashboard edit toggle, detail pause/resume | the four free wins, whole-app reach |
| 2 | `AppColorModeButton`, check-now settle | replaces Nuxt UI's double-SVG toggle |
| 3 | copy-to-clipboard, `AppPasswordInput` | two new features |
| 4 | view toggle, inline validation, sidebar collapse | optional, each with a caveat above |

Phase 1 is where the plan pays for itself: four small diffs, and one of them
(`StatusBadge.vue`) reaches every status indicator in the application.
