<script setup lang="ts">
import type { LatencyChartStyle, MonitorStatsPoint } from '#shared/types/monitor'
import { latencyStyleShowsSpread } from '#shared/utils/monitor'

const props = defineProps<{
  points: MonitorStatsPoint[]
  /** Fixed plot height in pixels. Omit to fill the available space. */
  height?: number
  /**
   * Overrides the reader's chart style, for a widget that insists on one.
   * Named apart from the `style` attribute, which Vue applies to the root
   * element whatever a component declares.
   */
  chartStyle?: LatencyChartStyle
}>()

/**
 * The chart is drawn in a fixed coordinate system and stretched to the container
 * with `preserveAspectRatio="none"`. `vector-effect` keeps the stroke crisp;
 * all text lives outside the SVG so it is never distorted, and so does the
 * hover marker, because a circle would be stretched into an ellipse.
 */
const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 300
const TOP_PADDING = 24

/**
 * A step this many times the usual distance between two buckets is a hole in the
 * history rather than a long wait between two checks.
 */
const GAP_FACTOR = 2.5

/** Above this share of the plot height the tooltip would cover the curve it describes. */
const TOOLTIP_FLIP_RATIO = 0.45

/** Share of the readings the scale has to hold once the maxima are drawn. */
const SCALE_QUANTILE = 0.98

/** The value `share` of the readings stay below, the rest running off the top. */
function quantileOf(values: number[], share: number): number {
  if (!values.length) {
    return 0
  }

  const sorted = [...values].sort((first, second) => first - second)

  return sorted[Math.floor((sorted.length - 1) * share)]!
}

const { formatLatency, formatNumber, formatTime, formatDate } = useFormatters()

/**
 * How the chart is drawn. The reader's own setting unless a widget hands one
 * down: a dashboard is composed once and read by everybody, so its author may
 * pin a look, while everything else follows whoever is looking.
 */
const readerStyle = useLatencyChartStyle()

const activeStyle = computed<LatencyChartStyle>(() => props.chartStyle ?? readerStyle.value)

/** The average is always drawn; the three other styles add the spread around it. */
const showsSpread = computed(() => latencyStyleShowsSpread(activeStyle.value))

const chartId = useId()

/** One decimal is a tenth of a viewport unit; the rest only lengthens the path. */
function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Two measured buckets are the least a line can be drawn from. A single one used
 * to render as a two pixel stub in an otherwise empty plot, with both axis
 * labels showing the same timestamp — which reads as a broken chart rather than
 * as a monitor that has only just started reporting.
 */
const measured = computed(() => props.points.filter(point => point.avgLatencyMs !== null).length)

const hasData = computed(() => measured.value >= 2)

/**
 * The time the plot spans. Buckets are placed on it by their timestamp rather
 * than by their position in the list, because the server only returns buckets it
 * has data for: spacing them evenly would compress a paused hour into the width
 * of a single check and put every hover reading at the wrong time.
 */
const domain = computed(() => {
  const start = props.points.at(0)?.bucketStart ?? 0
  const end = props.points.at(-1)?.bucketStart ?? 0

  return { start, span: Math.max(1, end - start) }
})

/**
 * Distance between two neighbouring buckets, taken as the median of the actual
 * distances rather than as the configured bucket width, which the chart is not
 * told. The median rather than the smallest: two checks landing in one bucket
 * leave the next one empty, and that pair alone would halve the estimate.
 */
const bucketStep = computed(() => {
  const deltas: number[] = []

  for (let index = 1; index < props.points.length; index++) {
    deltas.push(props.points[index]!.bucketStart - props.points[index - 1]!.bucketStart)
  }

  if (!deltas.length) {
    return 0
  }

  deltas.sort((first, second) => first - second)

  return deltas[Math.floor(deltas.length / 2)]!
})

/**
 * Bare clock labels are ambiguous once a chart spans more than a day, so the
 * axis switches to dates as the covered span grows.
 */
const axisLabel = computed(() => {
  if (props.points.length < 2) {
    return () => ''
  }

  const span = domain.value.span

  if (span > 7 * 86_400) {
    return formatDate
  }

  return span > 6 * 3600 ? (value: number) => `${formatDate(value)}, ${formatTime(value)}` : formatTime
})

/**
 * The tooltip names a single bucket, so it needs more precision than the two
 * ends of the axis: the date as soon as the chart spans more than a day, and
 * seconds wherever two buckets are less than a minute apart. Once a bucket is a
 * whole day the clock says nothing and is dropped again.
 */
const bucketLabel = computed(() => {
  const step = bucketStep.value

  if (step >= 86_400) {
    return formatDate
  }

  const clock = (value: number) => formatTime(value, step > 0 && step < 60)

  return domain.value.span > 86_400 ? (value: number) => `${formatDate(value)}, ${clock(value)}` : clock
})

/**
 * Rounds the axis maximum up to a readable step.
 *
 * Measured against what is actually drawn, and with the maxima on, against all
 * but the slowest of them. Scaling to the true peak is what a chart normally
 * does, but the maxima are per-bucket extremes: one timed out request then sets
 * the scale for a whole month and presses the entire series flat against the
 * baseline, which is the one thing the reader did not turn the bounds on to
 * see. Those few readings run off the top instead — `yOf` clamps them to the
 * edge — and the tooltip still reports every one of them exactly.
 *
 * With the average alone nothing is cut: a bucket average is already a
 * reading over many checks, so it has no comparable outliers to guard against.
 */
const yMax = computed(() => {
  const drawn = props.points.map(point => Math.max(
    point.avgLatencyMs ?? 0,
    showsSpread.value ? point.maxLatencyMs ?? 0 : 0
  ))

  const peak = Math.max(showsSpread.value ? quantileOf(drawn, SCALE_QUANTILE) : Math.max(...drawn, 0), 1)
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  const step = [1, 2, 2.5, 5, 10].find(factor => factor * magnitude >= peak) ?? 10

  return step * magnitude
})

function xOf(bucketStart: number): number {
  return props.points.length > 1
    ? ((bucketStart - domain.value.start) / domain.value.span) * VIEW_WIDTH
    : VIEW_WIDTH / 2
}

function yOf(value: number): number {
  return Math.max(0, VIEW_HEIGHT - (value / yMax.value) * (VIEW_HEIGHT - TOP_PADDING))
}

interface PlotPoint {
  x: number
  y: number
}

/**
 * Consecutive runs of measured buckets, so gaps stay gaps instead of straight
 * lines. A bucket the reading is missing from breaks the run, and so does a jump
 * over several missing ones — the history simply stops there.
 *
 * Taken per series rather than once for the whole chart: a bucket carries its
 * bounds exactly where it carries an average, but the runs are the input of
 * every curve below, and a band needs the buckets holding *both* of its edges.
 */
function runs(valueOf: (point: MonitorStatsPoint) => number | null): MonitorStatsPoint[][] {
  const result: MonitorStatsPoint[][] = []
  const gapLimit = bucketStep.value * GAP_FACTOR
  let current: MonitorStatsPoint[] = []
  let previous: number | null = null

  for (const point of props.points) {
    const isGap = previous !== null && gapLimit > 0 && point.bucketStart - previous > gapLimit
    const missing = valueOf(point) === null

    previous = point.bucketStart

    if (missing || isGap) {
      if (current.length) {
        result.push(current)
      }

      current = []

      if (missing) {
        continue
      }
    }

    current.push(point)
  }

  if (current.length) {
    result.push(current)
  }

  return result
}

/** The runs of one series, projected into the plot. */
function segmentsOf(valueOf: (point: MonitorStatsPoint) => number | null): PlotPoint[][] {
  return runs(valueOf).map(run => run.map(point => ({
    x: xOf(point.bucketStart),
    y: yOf(valueOf(point)!)
  })))
}

const segments = computed(() => segmentsOf(point => point.avgLatencyMs))

/**
 * The spread of the checks inside each bucket, as runs holding both bounds.
 *
 * Drawn as one filled band rather than as two curves: min and max are not
 * series of their own, they are the two edges of what a single bucket saw, and
 * the area between them is the reading.
 */
const bandRuns = computed(() => showsSpread.value
  ? runs(point => point.minLatencyMs !== null && point.maxLatencyMs !== null ? point.minLatencyMs : null)
  : [])

/**
 * Monotone cubic interpolation (Fritsch–Carlson), emitted as one Bézier per
 * span and without the leading move, so the line and the area below it are drawn
 * from the same curve.
 *
 * Monotone rather than a plain spline: an overshooting curve invents latencies
 * that were never measured and dips the fill below the baseline on either side
 * of a spike. On a response time chart that reads as data rather than as
 * rounding. The tangents are the weighted harmonic mean of the two neighbouring
 * slopes, which is zero at every local extreme and therefore cannot overshoot.
 */
function curveCommands(points: PlotPoint[]): string {
  const count = points.length
  const widths: number[] = []
  const slopes: number[] = []

  for (let index = 0; index < count - 1; index++) {
    const width = points[index + 1]!.x - points[index]!.x

    widths.push(width)
    slopes.push((points[index + 1]!.y - points[index]!.y) / width)
  }

  const tangents = slopes.map((slope, index) => {
    const previous = slopes[index - 1]

    if (previous === undefined) {
      return slope
    }

    if (previous * slope <= 0) {
      return 0
    }

    const left = 2 * widths[index]! + widths[index - 1]!
    const right = widths[index]! + 2 * widths[index - 1]!

    return (left + right) / (left / previous + right / slope)
  })

  tangents.push(slopes[count - 2]!)

  const commands: string[] = []

  for (let index = 0; index < count - 1; index++) {
    const from = points[index]!
    const to = points[index + 1]!
    const third = widths[index]! / 3

    commands.push(
      `C ${round(from.x + third)} ${round(from.y + tangents[index]! * third)}`
      + ` ${round(to.x - third)} ${round(to.y - tangents[index + 1]! * third)}`
      + ` ${round(to.x)} ${round(to.y)}`
    )
  }

  return commands.join(' ')
}

function linePathsOf(source: PlotPoint[][]): string[] {
  return source.map((segment) => {
    const first = segment[0]!

    return segment.length === 1
      ? `M ${round(first.x - 1)} ${round(first.y)} L ${round(first.x + 1)} ${round(first.y)}`
      : `M ${round(first.x)} ${round(first.y)} ${curveCommands(segment)}`
  })
}

/**
 * `ticks`: the spread of each bucket as its own vertical stroke. Nothing is
 * drawn between two buckets, which is the whole point of the treatment — an
 * extreme is a single check, not a value the monitor held until the next one.
 */
const spreadTicks = computed(() => activeStyle.value !== 'ticks'
  ? []
  : bandRuns.value.flatMap(run => run.map(point => ({
      key: point.bucketStart,
      x: round(xOf(point.bucketStart)),
      y1: round(yOf(point.maxLatencyMs!)),
      y2: round(yOf(point.minLatencyMs!))
    }))))

/** `band`: the two edges of the fill, drawn as curves of their own. */
const bandEdgePaths = computed(() => activeStyle.value !== 'band'
  ? []
  : [
      ...linePathsOf(bandRuns.value.map(run => run.map(point => ({ x: xOf(point.bucketStart), y: yOf(point.maxLatencyMs!) })))),
      ...linePathsOf(bandRuns.value.map(run => run.map(point => ({ x: xOf(point.bucketStart), y: yOf(point.minLatencyMs!) }))))
    ])

const linePaths = computed(() => linePathsOf(segments.value))

/**
 * The fill below the average. Dropped under a filled band of the same colour:
 * two translucent primaries over one another read as a third shade that means
 * nothing. The other two treatments keep it — `ticks` has no fill to collide
 * with, and `neutral` deliberately colours the two apart.
 */
const areaPaths = computed(() => bandRuns.value.length && activeStyle.value === 'band'
  ? []
  : segments.value
      .filter(segment => segment.length > 1)
      .map((segment) => {
        const first = segment[0]!
        const last = segment.at(-1)!

        return `M ${round(first.x)} ${VIEW_HEIGHT} L ${round(first.x)} ${round(first.y)}`
          + ` ${curveCommands(segment)} L ${round(last.x)} ${VIEW_HEIGHT} Z`
      }))

/**
 * The band, closed along the maximum and walked back along the minimum.
 *
 * The lower edge runs through the same interpolation backwards rather than
 * being drawn as its own curve, so both edges of the band are the curves the
 * two bounds would have been on their own. A run of one bucket has no curve to
 * close and is drawn as the sliver between its two readings.
 */
const bandPaths = computed(() => (activeStyle.value === 'ticks' ? [] : bandRuns.value).map((run) => {
  const upper = run.map(point => ({ x: xOf(point.bucketStart), y: yOf(point.maxLatencyMs!) }))
  const lower = [...run].reverse().map(point => ({ x: xOf(point.bucketStart), y: yOf(point.minLatencyMs!) }))
  const first = upper[0]!
  const turn = lower[0]!

  if (run.length === 1) {
    return `M ${round(first.x - 1)} ${round(first.y)} L ${round(first.x + 1)} ${round(first.y)}`
      + ` L ${round(turn.x + 1)} ${round(turn.y)} L ${round(turn.x - 1)} ${round(turn.y)} Z`
  }

  return `M ${round(first.x)} ${round(first.y)} ${curveCommands(upper)}`
    + ` L ${round(turn.x)} ${round(turn.y)} ${curveCommands(lower)} Z`
}))

/**
 * Buckets the predicate marks, drawn as vertical bands. Neighbouring ones are
 * merged into a single rectangle: at these bucket widths a run covers dozens of
 * them, and a row of touching rectangles seams wherever two edges land inside
 * the same pixel.
 */
function bandsWhere(marks: (point: MonitorStatsPoint) => boolean) {
  if (props.points.length < 2) {
    return []
  }

  const width = (bucketStep.value / domain.value.span) * VIEW_WIDTH
  const bands: Array<{ key: number, from: number, to: number }> = []

  for (const point of props.points) {
    if (!marks(point)) {
      continue
    }

    const from = xOf(point.bucketStart) - width / 2
    const previous = bands.at(-1)

    if (previous && from <= previous.to + 0.5) {
      previous.to = from + width
      continue
    }

    bands.push({ key: point.bucketStart, from, to: from + width })
  }

  return bands.map((band) => {
    const from = Math.max(0, band.from)

    return { key: band.key, x: from, width: Math.max(2, Math.min(VIEW_WIDTH, band.to) - from) }
  })
}

/** Buckets containing at least one failed check that was actually judged. */
const outages = computed(() => bandsWhere(point => point.downCount > 0))

/**
 * Buckets that ran under maintenance. Drawn behind the outage bands and in the
 * colour of the status rather than of a fault, because it answers the question
 * the gap in the curve raises: nothing is missing here, nothing was measured.
 *
 * A bucket holding both is marked twice, which is right — a window that only
 * covered part of the hour leaves real failures on either side of it.
 */
const maintenanceBands = computed(() => bandsWhere(point => point.maintenanceCount > 0))

const hoverIndex = ref<number | null>(null)
const isHovering = ref(false)
const plotWidth = ref(0)

const hoveredPoint = computed(() => hoverIndex.value === null ? null : props.points[hoverIndex.value] ?? null)

const showTooltip = computed(() => hasData.value && isHovering.value && hoveredPoint.value !== null)

/** Position of the hovered bucket inside the plot, as a fraction of its box. */
const hoveredRatio = computed(() => hoveredPoint.value ? xOf(hoveredPoint.value.bucketStart) / VIEW_WIDTH : 0)

/** Marker position, on the average — the only curve a single point stands for. */
const hoveredHeight = computed(() => hoveredPoint.value?.avgLatencyMs == null
  ? null
  : yOf(hoveredPoint.value.avgLatencyMs) / VIEW_HEIGHT)

/** The topmost reading drawn at the hovered bucket, which is what has to be cleared. */
const hoveredPeak = computed(() => {
  const point = hoveredPoint.value

  if (!point) {
    return null
  }

  const drawn = [
    showsSpread.value ? point.maxLatencyMs : null,
    point.avgLatencyMs
  ].filter(value => value !== null)

  return drawn.length ? yOf(Math.max(...drawn)) / VIEW_HEIGHT : null
})

/**
 * The tooltip sits at the top edge, and moves to the bottom one whenever the
 * reading it describes is high enough that it would otherwise cover its own
 * curve. The axis maximum steps aside for the same reason.
 */
const tooltipAtTop = computed(() => hoveredPeak.value === null || hoveredPeak.value >= TOOLTIP_FLIP_RATIO)

/**
 * The span of the hovered bucket, where a style draws one. The tooltip reports
 * what the chart draws — a number for something that is not on screen reads as
 * a second series rather than as extra detail.
 */
const boundsLabel = computed(() => {
  const point = hoveredPoint.value

  if (!showsSpread.value || !point || point.minLatencyMs === null || point.maxLatencyMs === null) {
    return null
  }

  // A bucket holding a single check has no span to report next to its average.
  return point.minLatencyMs === point.maxLatencyMs
    ? null
    : `${formatNumber(point.minLatencyMs)}–${formatLatency(point.maxLatencyMs)}`
})

/**
 * Kept inside the plot rather than centred on the bucket at any cost: half a
 * tooltip hanging over the edge of a widget is exactly where the first and the
 * last check of a range are read.
 */
const tooltip = useTemplateRef<HTMLElement>('tooltip')
const tooltipWidth = ref(0)

const tooltipStyle = computed(() => {
  const half = tooltipWidth.value / 2
  const offset = hoveredRatio.value * plotWidth.value

  return {
    left: `${plotWidth.value > tooltipWidth.value ? Math.min(Math.max(offset, half), plotWidth.value - half) : half}px`
  }
})

onMounted(() => {
  const element = tooltip.value

  if (!element) {
    return
  }

  // The border box, which `contentRect` is not: the tooltip is clamped by what
  // it occupies, padding and border included.
  const observer = new ResizeObserver(() => {
    tooltipWidth.value = element.offsetWidth
  })

  observer.observe(element)
  onScopeDispose(() => observer.disconnect())
})

/**
 * The bucket closest to a moment in time, not the one closest in index order.
 * The list is ordered, so the distance falls until the nearest bucket is passed
 * and the scan can stop there.
 */
function nearestIndex(at: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY

  for (const [index, point] of props.points.entries()) {
    const distance = Math.abs(point.bucketStart - at)

    if (distance > bestDistance) {
      break
    }

    best = index
    bestDistance = distance
  }

  return best
}

function onPointerMove(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()

  if (!bounds.width || props.points.length === 0) {
    return
  }

  plotWidth.value = bounds.width

  const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))

  hoverIndex.value = nearestIndex(domain.value.start + ratio * domain.value.span)
  isHovering.value = true
}
</script>

<template>
  <div class="flex flex-col gap-2 h-full min-h-0">
    <div
      class="relative w-full flex-1 min-h-0"
      :style="height ? { height: `${height}px`, flex: 'none' } : undefined"
      @pointermove="onPointerMove"
      @pointerleave="isHovering = false"
    >
      <svg
        class="absolute inset-0 size-full overflow-visible"
        :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            :id="`gradient-${chartId}`"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              class="text-primary"
              stop-color="currentColor"
              stop-opacity="0.28"
            />
            <stop
              offset="100%"
              class="text-primary"
              stop-color="currentColor"
              stop-opacity="0"
            />
          </linearGradient>
        </defs>

        <line
          v-for="fraction in [0.25, 0.5, 0.75]"
          :key="fraction"
          x1="0"
          :y1="TOP_PADDING + (VIEW_HEIGHT - TOP_PADDING) * fraction"
          :x2="VIEW_WIDTH"
          :y2="TOP_PADDING + (VIEW_HEIGHT - TOP_PADDING) * fraction"
          class="stroke-default"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          stroke-dasharray="3 5"
        />

        <rect
          v-for="band in maintenanceBands"
          :key="`maintenance-${band.key}`"
          :x="band.x"
          y="0"
          :width="band.width"
          :height="VIEW_HEIGHT"
          class="fill-info/15"
        />

        <rect
          v-for="outage in outages"
          :key="outage.key"
          :x="outage.x"
          y="0"
          :width="outage.width"
          :height="VIEW_HEIGHT"
          class="fill-error/15"
        />

        <path
          v-for="(path, index) in bandPaths"
          :key="`band-${index}`"
          :d="path"
          :class="activeStyle === 'neutral' ? 'fill-neutral-500/25' : 'fill-primary/10'"
        />

        <path
          v-for="(path, index) in bandEdgePaths"
          :key="`edge-${index}`"
          :d="path"
          fill="none"
          class="stroke-primary/40"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />

        <line
          v-for="tick in spreadTicks"
          :key="`tick-${tick.key}`"
          :x1="tick.x"
          :y1="tick.y1"
          :x2="tick.x"
          :y2="tick.y2"
          class="stroke-primary/25"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />

        <path
          v-for="(path, index) in areaPaths"
          :key="`area-${index}`"
          :d="path"
          :fill="`url(#gradient-${chartId})`"
        />

        <path
          v-for="(path, index) in linePaths"
          :key="`line-${index}`"
          :d="path"
          fill="none"
          class="stroke-primary"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />

        <line
          v-if="showTooltip"
          :x1="xOf(hoveredPoint!.bucketStart)"
          y1="0"
          :x2="xOf(hoveredPoint!.bucketStart)"
          :y2="VIEW_HEIGHT"
          class="stroke-toned"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <span
        class="absolute left-0 top-0 text-xs text-dimmed tabular-nums transition-opacity"
        :class="showTooltip && tooltipAtTop ? 'opacity-0' : 'opacity-100'"
      >{{ formatLatency(yMax) }}</span>

      <!--
        Drawn as an element rather than as an SVG circle: the plot is stretched
        to the container with `preserveAspectRatio="none"`, which would turn a
        circle into an ellipse of whatever shape the cell happens to have.
      -->
      <span
        v-if="showTooltip && hoveredHeight !== null"
        class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-default"
        :style="{ left: `${hoveredRatio * 100}%`, top: `${hoveredHeight * 100}%` }"
      />

      <div
        v-if="!hasData"
        class="absolute inset-0 grid place-items-center text-sm text-dimmed"
      >
        {{ $t(measured ? 'monitor.detail.collecting' : 'monitor.detail.noData') }}
      </div>

      <!--
        Always mounted, and hidden rather than unmounted or taken out of the
        layout: the box has to keep being measured while it is invisible, or the
        clamp above would run against a width of zero the first time it is shown.
      -->
      <div
        ref="tooltip"
        class="pointer-events-none absolute z-10 w-max max-w-full -translate-x-1/2 rounded-md border border-default bg-elevated px-2 py-1 text-xs shadow-lg"
        :class="[tooltipAtTop ? 'top-0' : 'bottom-0', showTooltip ? 'opacity-100' : 'invisible opacity-0']"
        :style="tooltipStyle"
      >
        <template v-if="hoveredPoint">
          <div class="text-[11px]/4 text-dimmed tabular-nums">
            {{ bucketLabel(hoveredPoint.bucketStart) }}
          </div>
          <div class="flex flex-wrap items-baseline gap-x-1.5">
            <span class="font-medium tabular-nums">{{ formatLatency(hoveredPoint.avgLatencyMs) }}</span>
            <span
              v-if="boundsLabel"
              class="text-dimmed tabular-nums"
            >{{ boundsLabel }}</span>
          </div>
          <div
            v-if="hoveredPoint.downCount > 0"
            class="text-error tabular-nums"
          >
            {{ hoveredPoint.downCount }} × {{ $t('status.down') }}
          </div>
          <div
            v-if="hoveredPoint.maintenanceCount > 0"
            class="text-info tabular-nums"
          >
            {{ $t('maintenance.checksInWindow', { count: hoveredPoint.maintenanceCount }) }}
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="points.length > 1"
      class="flex min-w-0 items-center justify-between gap-2 text-xs text-dimmed tabular-nums"
    >
      <span
        class="min-w-0 truncate"
        :title="axisLabel(points[0]!.bucketStart)"
      >{{ axisLabel(points[0]!.bucketStart) }}</span>
      <span
        class="min-w-0 truncate text-right"
        :title="axisLabel(points.at(-1)!.bucketStart)"
      >{{ axisLabel(points.at(-1)!.bucketStart) }}</span>
    </div>
  </div>
</template>
