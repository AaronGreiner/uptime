<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorStatsPoint, MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)
const range = computed<StatsRange>(() => props.widget.config.range ?? '24h')

const { data, refresh, status } = useAsyncData(
  () => `chart-${props.widget.id}-${range.value}`,
  () => $fetch<{ points: MonitorStatsPoint[] }>(`/api/monitors/${props.widget.monitorId}/stats`, {
    query: { range: range.value }
  }),
  { watch: [range, () => props.widget.monitorId], immediate: Boolean(props.widget.monitorId) }
)

// The buckets are aggregated server side, so a fresh check means a refetch.
onMonitorChecked(() => {
  void refresh()
}, () => props.widget.monitorId)
</script>

<template>
  <UCard
    v-if="monitor"
    variant="outline"
    class="h-full"
    :ui="{ root: 'flex flex-col overflow-hidden', body: 'flex-1 flex flex-col gap-3 min-h-0' }"
  >
    <div class="flex items-baseline justify-between gap-3">
      <p class="font-medium text-highlighted truncate-target">
        {{ widget.config.title || monitor.name }}
      </p>
      <p class="text-xs text-dimmed shrink-0">
        {{ $t(`range.${range}`) }}
      </p>
    </div>

    <USkeleton
      v-if="status === 'pending' && !data"
      class="flex-1 w-full"
    />
    <MonitorLatencyChart
      v-else
      class="flex-1 min-h-0"
      :points="data?.points ?? []"
    />
  </UCard>
  <DashboardWidgetMissing v-else />
</template>
