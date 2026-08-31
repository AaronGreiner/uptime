<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { monitorPath } = useMonitorPath()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)
const range = computed<StatsRange>(() => props.widget.config.range ?? WIDGET_CONFIG_DEFAULTS.range)

/** `inherit` leaves the style to the reader, which is what the chart does with no prop. */
const chartStyle = computed(() => {
  const configured = props.widget.config.style ?? WIDGET_CONFIG_DEFAULTS.style

  return configured === 'inherit' ? undefined : configured
})

/** Only the fallback: a hand written title is the author's own wording. */
const title = computed(() => props.widget.config.title || monitorPath(monitor.value))

// The buckets are aggregated server side, so a fresh check means a refetch. The
// shared fetcher keys by monitor and range, so two charts of the same thing make
// one request between them, and throttles it for the long ranges.
const { data, status } = useMonitorStats(() => props.widget.monitorId, range)
</script>

<template>
  <DashboardWidgetShell
    v-if="monitor"
    :title="title"
    :to="`/monitors/${monitor.id}`"
    :dense="widget.height === 'compact'"
    :caption="$t(`range.${range}`)"
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
      <MonitorLatencyChart
        v-else
        class="h-full min-h-0"
        :points="data?.points ?? []"
        :chart-style="chartStyle"
      />
    </template>
  </DashboardWidgetShell>
  <DashboardWidgetMissing v-else />
</template>
