<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)
const range = computed<StatsRange>(() => props.widget.config.range ?? WIDGET_CONFIG_DEFAULTS.range)

// The buckets are aggregated server side, so a fresh check means a refetch. The
// shared fetcher keys by monitor and range, so two charts of the same thing make
// one request between them, and throttles it for the long ranges.
const { data, status } = useMonitorStats(() => props.widget.monitorId, range)
</script>

<template>
  <DashboardWidgetShell
    v-if="monitor"
    :title="widget.config.title || monitor.name"
    :to="`/monitors/${monitor.id}`"
    plain
    :caption="$t(`range.${range}`)"
  >
    <USkeleton
      v-if="status === 'pending' && !data"
      class="size-full"
    />
    <MonitorLatencyChart
      v-else
      class="h-full min-h-0"
      :points="data?.points ?? []"
    />
  </DashboardWidgetShell>
  <DashboardWidgetMissing v-else />
</template>
