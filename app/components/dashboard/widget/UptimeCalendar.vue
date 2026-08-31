<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorDailyPoint, MonitorWithState } from '#shared/types/monitor'
import { CALENDAR_GRID_CLASS, CALENDAR_SQUARE_CLASS, calendarDaysForWidth } from '#shared/utils/grid'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

/** The hourly rollups are kept for a year, so nothing older can be drawn. */
const MAX_DAYS = 365

const { t } = useI18n()
const { formatDate, formatLatency, formatNumber, formatUptime } = useFormatters()
const { monitorPath } = useMonitorPath()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)
const days = computed(() => calendarDaysForWidth(props.widget.width, MAX_DAYS))

const { data, status } = useMonitorDaily(() => props.widget.monitorId, days)

interface CalendarDay {
  dayStart: number
  ratio: number | null
  upCount: number
  downCount: number
  maintenanceCount: number
  avgLatencyMs: number | null
}

/**
 * The response only holds days that recorded checks, so the gaps are filled here
 * rather than left to the grid: a missing day has to occupy its square, or every
 * day after it slides into the wrong weekday.
 */
const calendar = computed<CalendarDay[]>(() => {
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

  return result
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

  return first ? (new Date(first.dayStart * 1000).getDay() + 6) % 7 : 0
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
    return day.maintenanceCount > 0 ? 'bg-info/40' : 'bg-elevated'
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

/** Height the readout needs above a square before it has to hang below it. */
const READOUT_HEIGHT_PX = 30

/** The hovered square and where to hang its readout, in container pixels. */
const hovered = ref<{ day: CalendarDay, x: number, y: number, below: boolean, anchorEnd: boolean } | null>(null)

function onEnter(event: MouseEvent, day: CalendarDay) {
  const square = event.currentTarget as HTMLElement
  const frame = square.offsetParent as HTMLElement | null
  const x = square.offsetLeft + square.offsetWidth / 2

  hovered.value = {
    day,
    x,
    y: square.offsetTop,
    // Always opens towards the middle of the card, so it stays inside it
    // whatever the wording of the day it describes turns out to be. Centring it
    // over the square instead would need its width, which it does not have yet.
    anchorEnd: x > (frame?.clientWidth ?? 0) / 2,
    // The top row has nothing above it to hang from.
    below: square.offsetTop < READOUT_HEIGHT_PX
  }
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
    plain
    :title="title"
    :to="`/monitors/${monitor.id}`"
    :caption="caption"
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

    <template #default>
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
      <!--
        Weeks are columns of fixed size squares, so the cell decides how many weeks
        it holds rather than how large a day is. Reversed like the pulse bar: the
        row packs at its right edge, the oldest weeks run off to the left, and the
        fade turns the cut into an edge rather than half a column.
      -->
      <!--
        Two boxes on purpose: the inner one clips the weeks that do not fit, the
        outer one carries the readout, which must be able to leave the row without
        being cut off by the very clipping that makes the row work.
      -->
      <div
        v-else
        class="relative h-full"
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

        <div
          v-if="hovered"
          class="pointer-events-none absolute z-10 rounded-md border border-default bg-elevated px-2 py-1 text-xs shadow-lg whitespace-nowrap"
          :class="[hovered.below ? '' : '-translate-y-full', hovered.anchorEnd ? '-translate-x-full' : '']"
          :style="{ left: `${hovered.x}px`, top: `${hovered.below ? hovered.y + 17 : hovered.y - 6}px` }"
        >
          <span class="text-dimmed">{{ formatDate(hovered.day.dayStart) }}</span>
          <span class="mx-1.5 text-muted">·</span>
          <template v-if="hovered.day.ratio === null">
            <span
              v-if="hovered.day.maintenanceCount"
              class="text-info"
            >{{ $t('status.maintenance') }}</span>
            <span
              v-else
              class="text-dimmed"
            >{{ $t('monitor.detail.noData') }}</span>
          </template>
          <template v-else>
            <span class="font-medium tabular-nums">{{ formatUptime(hovered.day.ratio) }}</span>
            <span
              v-if="hovered.day.downCount"
              class="ml-1.5 text-error tabular-nums"
            >
              {{ formatNumber(hovered.day.downCount) }} × {{ $t('status.down') }}
            </span>
            <span
              v-if="hovered.day.avgLatencyMs !== null"
              class="ml-1.5 text-muted tabular-nums"
            >
              {{ formatLatency(hovered.day.avgLatencyMs) }}
            </span>
            <span
              v-if="hovered.day.maintenanceCount"
              class="ml-1.5 text-info tabular-nums"
            >
              {{ $t('maintenance.checksInWindow', { count: formatNumber(hovered.day.maintenanceCount) }) }}
            </span>
          </template>
        </div>
      </div>
    </template>
  </DashboardWidgetShell>
  <DashboardWidgetMissing v-else />
</template>
