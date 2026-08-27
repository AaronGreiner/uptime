<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { formatUptime } = useFormatters()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)
const range = computed<StatsRange>(() => props.widget.config.range ?? WIDGET_CONFIG_DEFAULTS.range)

/**
 * The 24 h figure travels with the monitor list and is already live, so only the
 * other ranges are worth a request of their own.
 */
const needsRequest = computed(() => range.value !== '24h')

const { data } = useMonitorStats(() => needsRequest.value ? props.widget.monitorId : null, range)

const uptime = computed(() => (needsRequest.value ? data.value?.uptime : null) ?? monitor.value?.uptime24h ?? null)

/*
 * The figure grows with the widget's width, so the shortest cell trades padding
 * for the row it needs. Clipping instead of scrolling: see MonitorCard.
 */
const cardUi = computed(() => ({
  root: 'flex',
  body: props.widget.height === 'compact'
    ? 'p-3 sm:p-4 flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-hidden'
    : 'p-4 sm:p-6 flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-hidden'
}))

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
    class="h-full @container"
    :ui="cardUi"
  >
    <NuxtLink
      :to="`/monitors/${monitor.id}`"
      class="text-xs @[20rem]:text-sm text-muted hover:text-primary transition-colors truncate-target"
    >
      {{ widget.config.title || monitor.name }}
    </NuxtLink>
    <p
      class="text-2xl @[18rem]:text-3xl @[24rem]:text-4xl font-semibold tabular-nums leading-tight"
      :class="tone"
    >
      {{ formatUptime(uptime?.ratio ?? null) }}
    </p>
    <p class="text-xs @[20rem]:text-sm text-muted">
      {{ $t('monitor.detail.uptime') }} · {{ $t(`range.${range}`) }}
    </p>
  </UCard>
  <DashboardWidgetMissing v-else />
</template>
