<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorStatus, MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { formatUptime, formatNumber } = useFormatters()
const compact = computed(() => props.widget.height === 'compact')

const cardUi = computed(() => ({
  root: 'flex @container',
  body: compact.value
    ? 'flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-hidden px-3 py-2 sm:p-4'
    : 'flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto'
}))

/** An empty monitor list in the widget config means "every monitor". */
const scoped = computed(() => {
  const ids = props.widget.config.monitorIds

  return ids?.length ? props.monitors.filter(monitor => ids.includes(monitor.id)) : props.monitors
})

const counts = computed(() => scoped.value.reduce((totals, monitor) => {
  totals[monitor.state.status] += 1

  return totals
}, { up: 0, down: 0, pending: 0, paused: 0 } as Record<MonitorStatus, number>))

const averageUptime = computed(() => {
  const ratios = scoped.value
    .map(monitor => monitor.uptime24h.ratio)
    .filter((ratio): ratio is number => ratio !== null)

  return ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null
})

const tiles = computed(() => ([
  {
    key: 'total',
    labelKey: 'widget.overview.total',
    value: formatNumber(scoped.value.length),
    icon: 'i-lucide-list',
    class: 'text-highlighted'
  },
  {
    key: 'up',
    labelKey: 'status.up',
    value: formatNumber(counts.value.up),
    icon: 'i-lucide-check',
    class: 'text-success'
  },
  {
    key: 'down',
    labelKey: 'status.down',
    value: formatNumber(counts.value.down),
    icon: 'i-lucide-x',
    class: 'text-error'
  },
  {
    key: 'pending',
    labelKey: 'status.pending',
    value: formatNumber(counts.value.pending),
    icon: 'i-lucide-triangle-alert',
    class: 'text-warning'
  },
  {
    key: 'paused',
    labelKey: 'status.paused',
    value: formatNumber(counts.value.paused),
    icon: 'i-lucide-pause',
    class: 'text-dimmed'
  },
  {
    key: 'uptime',
    labelKey: 'widget.overview.avgUptime',
    value: formatUptime(averageUptime.value),
    icon: 'i-lucide-activity',
    class: 'text-primary'
  }
]))
</script>

<template>
  <UCard
    variant="outline"
    class="h-full"
    :ui="cardUi"
  >
    <p
      v-if="widget.config.title"
      class="font-medium text-highlighted truncate-target"
      :class="compact ? 'text-sm leading-4' : ''"
    >
      {{ widget.config.title }}
    </p>

    <div
      class="grid grid-cols-2 @[26rem]:grid-cols-3 @[46rem]:grid-cols-6"
      :class="compact ? 'gap-x-3 gap-y-1 @[46rem]:gap-2' : 'gap-3 @[26rem]:gap-4'"
    >
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="min-w-0 @[60rem]:flex @[60rem]:items-center @[60rem]:justify-center @[60rem]:gap-2.5"
      >
        <UIcon
          :name="tile.icon"
          class="hidden @[60rem]:block size-5 shrink-0"
          :class="tile.class"
        />

        <div class="min-w-0">
          <p
            class="text-muted truncate-target @[46rem]:text-base @[46rem]:leading-5"
            :class="compact ? 'text-xs leading-4' : 'text-sm leading-tight'"
            :title="$t(tile.labelKey)"
          >
            {{ $t(tile.labelKey) }}
          </p>
          <p
            class="font-semibold tabular-nums @[46rem]:text-[2rem] @[46rem]:leading-9 @[60rem]:text-4xl @[60rem]:leading-10"
            :class="[tile.class, compact ? 'text-lg leading-5' : 'text-xl @[26rem]:text-2xl']"
          >
            {{ tile.value }}
          </p>
        </div>
      </div>
    </div>
  </UCard>
</template>
