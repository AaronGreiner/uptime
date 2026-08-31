<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatRelativeTime, formatTime } = useFormatters()
const { scoped } = useWidgetScope(() => props.widget)
const { nextStart } = useMaintenanceResolver()
const { label } = useMaintenanceLabel()

interface Row {
  monitor: MonitorWithState
  /** Null while the maintenance is running, which is what `active` says. */
  startsAt: number | null
  active: boolean
}

/**
 * What is in maintenance now, then what is due next.
 *
 * The two belong in one list rather than in two widgets: on a screen nobody is
 * standing in front of, the question at three in the morning and the question
 * at six in the evening are the same one — which of these monitors is not being
 * judged, and when does that change.
 */
const rows = computed<Row[]>(() => {
  const active: Row[] = []
  const upcoming: Row[] = []

  for (const monitor of scoped.value) {
    if (monitor.state.maintenance.active) {
      active.push({ monitor, startsAt: null, active: true })
      continue
    }

    const startsAt = nextStart(monitor)

    if (startsAt !== null) {
      upcoming.push({ monitor, startsAt, active: false })
    }
  }

  // Running first, ending soonest at the top; then the soonest to begin. An
  // open ended one has no end to sort by and sits behind the timed ones.
  active.sort((a, b) => (a.monitor.state.maintenance.until ?? Infinity) - (b.monitor.state.maintenance.until ?? Infinity))
  upcoming.sort((a, b) => a.startsAt! - b.startsAt!)

  return [...active, ...upcoming]
})

const activeCount = computed(() => rows.value.filter(row => row.active).length)

const title = computed(() => props.widget.config.title || t('widget.type.maintenance-schedule'))

const caption = computed(() => (activeCount.value
  ? t('widget.maintenance.activeCount', activeCount.value)
  : undefined))

function rowLabel(row: Row): string {
  return row.active
    ? label(row.monitor.state.maintenance) ?? t('status.maintenance')
    : t('maintenance.nextWindow', { time: formatTime(row.startsAt!) })
}
</script>

<template>
  <DashboardWidgetShell
    list
    :title="title"
    :dense="widget.height === 'compact'"
    :caption="caption"
    :empty="!rows.length"
    :empty-label="$t('maintenance.noneScheduled')"
    empty-icon="i-lucide-wrench"
  >
    <DashboardWidgetList
      :items="rows"
      :item-key="row => row.monitor.id"
      :height="widget.height"
      class="auto-rows-[45px] @[14rem]:auto-rows-[29px]"
    >
      <template #default="{ item: row }">
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 @[14rem]:flex">
          <UIcon
            name="i-lucide-wrench"
            class="size-3.5 shrink-0"
            :class="row.active ? 'text-info' : 'text-dimmed'"
          />
          <NuxtLink
            :to="`/monitors/${row.monitor.id}`"
            class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors"
          >
            <MonitorPathLabel :monitor="row.monitor" />
          </NuxtLink>
          <!-- The wording carries the time, so the cell that cannot hold both
             keeps the relative one: how soon is the reading, the clock time is
             the detail behind it. -->
          <span
            class="hidden @[20rem]:inline text-xs shrink-0 truncate-target max-w-40"
            :class="row.active ? 'text-info' : 'text-muted'"
            :title="rowLabel(row)"
          >
            {{ rowLabel(row) }}
          </span>
          <span
            v-if="!row.active"
            class="col-start-2 @[20rem]:hidden text-xs text-muted tabular-nums shrink-0"
          >
            {{ formatRelativeTime(row.startsAt) }}
          </span>
          <span
            v-else
            class="col-start-2 text-xs text-info @[14rem]:hidden"
          >
            {{ $t('status.maintenance') }}
          </span>
        </div>
      </template>
    </DashboardWidgetList>
  </DashboardWidgetShell>
</template>
