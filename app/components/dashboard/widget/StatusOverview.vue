<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorStatus, MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { formatUptime, formatNumber } = useFormatters()

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
  { key: 'up', value: counts.value.up, class: 'text-success' },
  { key: 'down', value: counts.value.down, class: 'text-error' },
  { key: 'pending', value: counts.value.pending, class: 'text-warning' },
  { key: 'paused', value: counts.value.paused, class: 'text-dimmed' }
] as const))
</script>

<template>
  <UCard
    variant="outline"
    class="h-full"
    :ui="{ root: 'flex @container', body: 'flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto' }"
  >
    <p
      v-if="widget.config.title"
      class="font-medium text-highlighted truncate-target"
    >
      {{ widget.config.title }}
    </p>

    <div class="grid grid-cols-2 @[26rem]:grid-cols-3 @[46rem]:grid-cols-6 gap-3 @[26rem]:gap-4">
      <div class="min-w-0">
        <p class="text-xs uppercase tracking-wide text-dimmed leading-tight">
          {{ $t('widget.overview.total') }}
        </p>
        <p class="text-xl @[26rem]:text-2xl font-semibold tabular-nums">
          {{ formatNumber(scoped.length) }}
        </p>
      </div>

      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="min-w-0"
      >
        <p class="text-xs uppercase tracking-wide text-dimmed leading-tight">
          {{ $t(`status.${tile.key}`) }}
        </p>
        <p
          class="text-xl @[26rem]:text-2xl font-semibold tabular-nums"
          :class="tile.class"
        >
          {{ formatNumber(tile.value) }}
        </p>
      </div>

      <div class="min-w-0 col-span-2 @[26rem]:col-span-3 @[46rem]:col-span-1">
        <p class="text-xs uppercase tracking-wide text-dimmed leading-tight">
          {{ $t('widget.overview.avgUptime') }}
        </p>
        <p class="text-xl @[26rem]:text-2xl font-semibold tabular-nums">
          {{ formatUptime(averageUptime) }}
        </p>
      </div>
    </div>
  </UCard>
</template>
