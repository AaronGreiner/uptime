<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorDailyPoint, MonitorWithState } from '#shared/types/monitor'
import { CALENDAR_GRID_CLASS, CALENDAR_SQUARE_CLASS, CALENDAR_SQUARE_PITCH_PX, calendarDaysForWidth } from '#shared/utils/grid'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

/** The hourly rollups are kept for a year, so nothing older can be drawn. */
const MAX_DAYS = 365

const { t } = useI18n()
const { formatDate, formatLatency, formatNumber, formatUptime } = useFormatters()
const { monitorPath } = useMonitorPath()
const offsetMinutes = useUtcOffsetMinutes()
const frame = useTemplateRef<HTMLElement>('frame')
const columns = ref<number | null>(null)

watch(frame, (element, _previous, onCleanup) => {
  if (!element) {
    return
  }

  const observer = new ResizeObserver(([entry]) => {
    columns.value = Math.max(1, Math.floor(((entry?.contentRect.width ?? element.clientWidth) + 3) / CALENDAR_SQUARE_PITCH_PX))
    hovered.value = null
  })

  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)

/**
 * Seven rows of squares are 95 px, which is more than a two row cell has left
 * once a header sits above them. The squares are the one thing that must not
 * change — a week reads the same block wherever it is drawn — so in a compact
 * cell the label lies over the days rather than above them, in the corner the
 * oldest weeks are already fading out of.
 */
const header = computed(() => {
  if (props.widget.config.showLabel === false) {
    return 'none'
  }

  return props.widget.height === 'compact' ? 'overlay' : 'above'
})

const days = computed(() => Math.min(MAX_DAYS, Math.max(
  calendarDaysForWidth(props.widget.width, MAX_DAYS),
  // Include a partial week at each end when a wide screen needs more history.
  columns.value === null ? 0 : (columns.value + 1) * 7
)))

const { data, status } = useMonitorDaily(() => props.widget.monitorId, days)

interface CalendarDay {
  dayStart: number
  ratio: number | null
  upCount: number
  downCount: number
  maintenanceCount: number
  unknownCount: number
  avgLatencyMs: number | null
}

/**
 * The response only holds days that recorded checks, so the gaps are filled here
 * rather than left to the grid: a missing day has to occupy its square, or every
 * day after it slides into the wrong weekday.
 */
const history = computed<CalendarDay[]>(() => {
  const points = new Map((data.value?.points ?? []).map(point => [point.dayStart, point]))

  if (!points.size) {
    return []
  }

  const first = Math.min(...points.keys())
  const last = Math.max(...points.keys())
  const result: CalendarDay[] = []

  for (let dayStart = first; dayStart <= last; dayStart += 86_400) {
    result.push(toDay(dayStart, points.get(dayStart)))
  }

  return result.slice(-days.value)
})

/**
 * The day a bucket stands for, at noon in the viewer's own zone.
 *
 * The server cuts the buckets against one fixed offset — the viewer's at the
 * time of the request — so a bucket from the other half of the year is 23:00
 * the evening before once the clock has changed, and both the weekday and the
 * date label would answer with that earlier day. Reading the aligned instant in
 * UTC gives the day the bucket was meant to be, and noon keeps the local date
 * out of reach of a zone whose midnight the change skips.
 */
function localDay(dayStart: number): Date {
  const aligned = new Date((dayStart + offsetMinutes.value * 60) * 1000)

  return new Date(aligned.getUTCFullYear(), aligned.getUTCMonth(), aligned.getUTCDate(), 12)
}

/** Weekday of a bucket, Monday first — the row its square belongs in. */
function weekday(dayStart: number): number {
  return (localDay(dayStart).getDay() + 6) % 7
}

/** Keep whole week columns and the newest partial week; captions follow what is visible. */
const calendar = computed(() => {
  const first = history.value[0]

  if (!first || columns.value === null) {
    return history.value
  }

  const blanks = weekday(first.dayStart)
  const totalColumns = Math.ceil((blanks + history.value.length) / 7)
  const start = Math.max(0, (totalColumns - columns.value) * 7 - blanks)

  return history.value.slice(start)
})

function toDay(dayStart: number, point: MonitorDailyPoint | undefined): CalendarDay {
  // Maintenance is deliberately left out of the ratio, exactly as the server
  // left it out of the counts: a nightly reboot must not dent the square it
  // happens to fall in.
  const total = (point?.upCount ?? 0) + (point?.downCount ?? 0)

  return {
    dayStart,
    ratio: total > 0 ? (point!.upCount) / total : null,
    upCount: point?.upCount ?? 0,
    downCount: point?.downCount ?? 0,
    maintenanceCount: point?.maintenanceCount ?? 0,
    unknownCount: point?.unknownCount ?? 0,
    avgLatencyMs: point?.avgLatencyMs ?? null
  }
}

/**
 * Empty squares that push the first day into its weekday, Monday first. They sit
 * at the oldest end, which is also the end the cell clips, so they usually never
 * reach the screen — but without them every later day lands a row off.
 */
const leadingBlanks = computed(() => {
  const first = calendar.value.at(0)

  return first ? weekday(first.dayStart) : 0
})

const overall = computed(() => {
  const measured = calendar.value.filter((day): day is CalendarDay & { ratio: number } => day.ratio !== null)

  return measured.length
    ? measured.reduce((sum, day) => sum + day.ratio, 0) / measured.length
    : null
})

/**
 * Five steps plus "nothing recorded", which reads as a gap rather than a fault.
 * The thresholds sit where uptime actually lives: everything interesting happens
 * between 99 % and 100 %, and a linear scale would render that whole band green.
 */
function dayClass(day: CalendarDay): string {
  if (day.ratio === null) {
    // A day nothing was judged on is not the same as a day nothing ran on: one
    // was in maintenance, the other has no history at all.
    if (day.maintenanceCount > 0) {
      return 'bg-info/40'
    }

    return day.unknownCount > 0 ? 'bg-muted/60' : 'bg-elevated'
  }

  if (day.ratio >= 0.9999) {
    return 'bg-success'
  }

  if (day.ratio >= 0.999) {
    return 'bg-success/50'
  }

  if (day.ratio >= 0.99) {
    return 'bg-warning'
  }

  return day.ratio >= 0.95 ? 'bg-error/60' : 'bg-error'
}

const hovered = ref<{ day: CalendarDay } | null>(null)
const tooltipReference = shallowRef<HTMLElement>()

function onEnter(event: MouseEvent, day: CalendarDay) {
  tooltipReference.value = event.currentTarget as HTMLElement
  hovered.value = { day }
}

const title = computed(() => props.widget.config.title || monitorPath(monitor.value) || t('widget.type.uptime-calendar'))

const caption = computed(() => {
  const span = t('widget.calendar.days', { days: calendar.value.length || days.value })

  return overall.value === null ? span : `${formatUptime(overall.value)} · ${span}`
})
</script>

<template>
  <DashboardWidgetShell
    v-if="monitor"
    :title="title"
    :to="`/monitors/${monitor.id}`"
    :caption="caption"
    :dense="widget.height === 'compact'"
    :header="header"
  >
    <template #title>
      <template v-if="widget.config.title">
        {{ widget.config.title }}
      </template>
      <MonitorPathLabel
        v-else
        :monitor="monitor"
      />
    </template>

    <template #caption>
      <span
        v-if="overall !== null"
        class="hidden @[24rem]:inline"
      >{{ formatUptime(overall) }} · </span>
      {{ $t('widget.calendar.days', { days: calendar.length || days }) }}
    </template>

    <div
      ref="frame"
      class="h-full"
    >
      <USkeleton
        v-if="status === 'pending' && !data"
        class="size-full"
      />
      <div
        v-else-if="!calendar.length"
        class="size-full grid place-items-center text-sm text-dimmed"
      >
        {{ $t('monitor.detail.noData') }}
      </div>
      <AppChartTooltip
        v-else
        :open="hovered !== null"
        :reference="tooltipReference"
        @update:open="!$event && (hovered = null)"
      >
        <div
          class="h-full"
          @mouseleave="hovered = null"
        >
          <!--
            Weeks are columns of fixed size squares, so the cell decides how many
            weeks it holds rather than how large a day is. Reversed like the pulse
            bar: the row packs at its right edge, the oldest weeks run off to the
            left, and the fade turns the cut into an edge rather than half a column.
          -->
          <div class="flex flex-row-reverse h-full items-center overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_1rem)]">
            <div
              class="grid grid-flow-col grid-rows-7 shrink-0"
              :class="CALENDAR_GRID_CLASS"
            >
              <div
                v-for="blank in leadingBlanks"
                :key="`blank-${blank}`"
                :class="CALENDAR_SQUARE_CLASS"
              />
              <div
                v-for="day in calendar"
                :key="day.dayStart"
                class="rounded-[2px] transition-opacity duration-150"
                :class="[
                  CALENDAR_SQUARE_CLASS,
                  dayClass(day),
                  hovered && hovered.day.dayStart !== day.dayStart ? 'opacity-40' : 'opacity-100'
                ]"
                @mouseenter="onEnter($event, day)"
              />
            </div>
          </div>
        </div>
        <template #content>
          <div
            v-if="hovered"
            class="flex flex-wrap items-baseline gap-x-1.5"
          >
            <span class="text-dimmed">{{ formatDate(localDay(hovered.day.dayStart).getTime() / 1000) }}</span>
            <template v-if="hovered.day.ratio === null">
              <span
                v-if="hovered.day.maintenanceCount"
                class="text-info"
              >{{ $t('status.maintenance') }}</span>
              <span
                v-else-if="hovered.day.unknownCount"
                class="text-dimmed"
              >{{ $t('status.unknown') }}</span>
              <span
                v-else
                class="text-dimmed"
              >{{ $t('monitor.detail.noData') }}</span>
            </template>
            <template v-else>
              <span class="font-medium tabular-nums">{{ formatUptime(hovered.day.ratio) }}</span>
              <span
                v-if="hovered.day.downCount"
                class="text-error tabular-nums"
              >
                {{ formatNumber(hovered.day.downCount) }} × {{ $t('status.down') }}
              </span>
              <span
                v-if="hovered.day.avgLatencyMs !== null"
                class="text-muted tabular-nums"
              >
                {{ formatLatency(hovered.day.avgLatencyMs) }}
              </span>
              <span
                v-if="hovered.day.maintenanceCount"
                class="text-info tabular-nums"
              >
                {{ $t('maintenance.checksInWindow', { count: formatNumber(hovered.day.maintenanceCount) }) }}
              </span>
              <span
                v-if="hovered.day.unknownCount"
                class="text-dimmed tabular-nums"
              >
                {{ $t('uplink.unjudgedChecks', { count: formatNumber(hovered.day.unknownCount) }) }}
              </span>
            </template>
          </div>
        </template>
      </AppChartTooltip>
    </div>
  </DashboardWidgetShell>
  <DashboardWidgetMissing v-else />
</template>
