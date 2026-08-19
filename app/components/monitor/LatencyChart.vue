<script setup lang="ts">
import type { MonitorStatsPoint } from '#shared/types/monitor'

const props = defineProps<{
  points: MonitorStatsPoint[]
  /** Fixed plot height in pixels. Omit to fill the available space. */
  height?: number
}>()

/**
 * The chart is drawn in a fixed coordinate system and stretched to the container
 * with `preserveAspectRatio="none"`. `vector-effect` keeps the stroke crisp;
 * all text lives outside the SVG so it is never distorted.
 */
const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 300
const TOP_PADDING = 24

const { formatLatency, formatTime, formatDate, formatDateTime } = useFormatters()

const chartId = useId()

const hasData = computed(() => props.points.some(point => point.avgLatencyMs !== null))

/**
 * Bare clock labels are ambiguous once a chart spans more than a day, so the
 * axis switches to dates as the covered span grows.
 */
const axisLabel = computed(() => {
  const first = props.points.at(0)?.bucketStart
  const last = props.points.at(-1)?.bucketStart

  if (first === undefined || last === undefined) {
    return () => ''
  }

  const span = last - first

  if (span > 7 * 86_400) {
    return formatDate
  }

  return span > 6 * 3600 ? (value: number) => `${formatDate(value)}, ${formatTime(value)}` : formatTime
})

/** Rounds the axis maximum up to a readable step. */
const yMax = computed(() => {
  const peak = Math.max(...props.points.map(point => point.maxLatencyMs ?? point.avgLatencyMs ?? 0), 1)
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  const step = [1, 2, 2.5, 5, 10].find(factor => factor * magnitude >= peak) ?? 10

  return step * magnitude
})

function xOf(index: number): number {
  return props.points.length > 1 ? (index / (props.points.length - 1)) * VIEW_WIDTH : VIEW_WIDTH / 2
}

function yOf(value: number): number {
  return VIEW_HEIGHT - (value / yMax.value) * (VIEW_HEIGHT - TOP_PADDING)
}

/** Consecutive runs of measured buckets, so gaps stay gaps instead of straight lines. */
const segments = computed(() => {
  const result: Array<Array<{ x: number, y: number }>> = []
  let current: Array<{ x: number, y: number }> = []

  props.points.forEach((point, index) => {
    if (point.avgLatencyMs === null) {
      if (current.length) {
        result.push(current)
      }

      current = []
      return
    }

    current.push({ x: xOf(index), y: yOf(point.avgLatencyMs) })
  })

  if (current.length) {
    result.push(current)
  }

  return result
})

const linePaths = computed(() => segments.value.map(segment => (
  segment.length === 1
    ? `M ${segment[0]!.x - 1} ${segment[0]!.y} L ${segment[0]!.x + 1} ${segment[0]!.y}`
    : segment.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
)))

const areaPaths = computed(() => segments.value
  .filter(segment => segment.length > 1)
  .map((segment) => {
    const body = segment.map(point => `L ${point.x} ${point.y}`).join(' ')

    return `M ${segment[0]!.x} ${VIEW_HEIGHT} ${body} L ${segment.at(-1)!.x} ${VIEW_HEIGHT} Z`
  }))

/** Buckets containing at least one failed check, drawn as vertical bands. */
const outages = computed(() => {
  const width = props.points.length > 1 ? VIEW_WIDTH / (props.points.length - 1) : VIEW_WIDTH

  return props.points
    .map((point, index) => ({ point, index }))
    .filter(entry => entry.point.downCount > 0)
    .map(entry => ({
      key: entry.point.bucketStart,
      x: Math.max(0, xOf(entry.index) - width / 2),
      width: Math.max(2, width)
    }))
})

const hoverIndex = ref<number | null>(null)

const hoveredPoint = computed(() => hoverIndex.value === null ? null : props.points[hoverIndex.value] ?? null)

function onPointerMove(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()

  if (!bounds.width || props.points.length === 0) {
    return
  }

  const ratio = (event.clientX - bounds.left) / bounds.width

  hoverIndex.value = Math.min(props.points.length - 1, Math.max(0, Math.round(ratio * (props.points.length - 1))))
}
</script>

<template>
  <div class="flex flex-col gap-2 h-full min-h-0">
    <div
      class="relative w-full flex-1 min-h-0"
      :style="height ? { height: `${height}px`, flex: 'none' } : undefined"
      @pointermove="onPointerMove"
      @pointerleave="hoverIndex = null"
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
          v-for="outage in outages"
          :key="outage.key"
          :x="outage.x"
          y="0"
          :width="outage.width"
          :height="VIEW_HEIGHT"
          class="fill-error/15"
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
          v-if="hoverIndex !== null"
          :x1="xOf(hoverIndex)"
          y1="0"
          :x2="xOf(hoverIndex)"
          :y2="VIEW_HEIGHT"
          class="stroke-toned"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <span class="absolute left-0 top-0 text-xs text-dimmed tabular-nums">{{ formatLatency(yMax) }}</span>

      <div
        v-if="!hasData"
        class="absolute inset-0 grid place-items-center text-sm text-dimmed"
      >
        {{ $t('monitor.detail.noData') }}
      </div>

      <div
        v-else-if="hoveredPoint"
        class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-default bg-elevated px-2 py-1 text-xs shadow-lg whitespace-nowrap"
        :style="{ left: `${points.length > 1 ? (hoverIndex! / (points.length - 1)) * 100 : 50}%` }"
      >
        <span class="text-dimmed">{{ formatDateTime(hoveredPoint.bucketStart) }}</span>
        <span class="mx-1.5 text-muted">·</span>
        <span class="font-medium tabular-nums">{{ formatLatency(hoveredPoint.avgLatencyMs) }}</span>
        <span
          v-if="hoveredPoint.downCount > 0"
          class="ml-1.5 text-error"
        >
          {{ hoveredPoint.downCount }} × {{ $t('status.down') }}
        </span>
      </div>
    </div>

    <div
      v-if="points.length"
      class="flex items-center justify-between text-xs text-dimmed tabular-nums"
    >
      <span>{{ axisLabel(points[0]!.bucketStart) }}</span>
      <span>{{ axisLabel(points.at(-1)!.bucketStart) }}</span>
    </div>
  </div>
</template>
