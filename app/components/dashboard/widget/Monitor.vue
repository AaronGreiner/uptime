<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const monitor = computed(() => props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null)

/** Very short cells drop the metric row so the pulse bar stays visible. */
const dense = computed(() => props.widget.height === 'compact')
</script>

<template>
  <MonitorCard
    v-if="monitor"
    :monitor="monitor"
    :heartbeat-count="widget.config.heartbeatCount ?? 40"
    :dense="dense"
  />
  <DashboardWidgetMissing v-else />
</template>
