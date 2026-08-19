<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorUptime, MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { formatUptime } = useFormatters()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)
const range = computed<StatsRange>(() => props.widget.config.range ?? '24h')

/**
 * The 24 h figure travels with the monitor list, every other range needs its own
 * request. Longer ranges are answered from the hourly rollups and change slowly,
 * so a one minute refresh is plenty.
 */
const { data: stats, refresh } = useAsyncData(
  () => `uptime-${props.widget.id}-${range.value}`,
  async (): Promise<MonitorUptime | null> => {
    if (!props.widget.monitorId || range.value === '24h') {
      return null
    }

    const response = await $fetch<{ uptime: MonitorUptime }>(`/api/monitors/${props.widget.monitorId}/stats`, {
      query: { range: range.value }
    })

    return response.uptime
  },
  { watch: [range, () => props.widget.monitorId] }
)

usePolling(refresh, 60_000)

const uptime = computed(() => stats.value ?? monitor.value?.uptime24h ?? null)

const tone = computed(() => {
  const ratio = uptime.value?.ratio

  if (ratio === null || ratio === undefined) {
    return 'text-dimmed'
  }

  if (ratio >= 0.999) {
    return 'text-success'
  }

  return ratio >= 0.99 ? 'text-warning' : 'text-error'
})
</script>

<template>
  <UCard
    v-if="monitor"
    variant="outline"
    class="h-full"
    :ui="{ root: 'flex', body: 'flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-y-auto' }"
  >
    <p class="text-sm text-muted truncate-target">
      {{ widget.config.title || monitor.name }}
    </p>
    <p
      class="text-3xl font-semibold tabular-nums leading-tight"
      :class="tone"
    >
      {{ formatUptime(uptime?.ratio ?? null) }}
    </p>
    <p class="text-sm text-muted">
      {{ $t('monitor.detail.uptime') }} · {{ $t(`range.${range}`) }}
    </p>
  </UCard>
  <DashboardWidgetMissing v-else />
</template>
