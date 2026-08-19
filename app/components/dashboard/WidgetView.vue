<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
  editing: boolean
}>()

const emit = defineEmits<{ edit: [], remove: [] }>()
</script>

<template>
  <div
    class="relative h-full group/widget"
    :class="editing ? 'cursor-grab' : ''"
  >
    <div
      v-if="editing"
      class="absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-0 group-hover/widget:opacity-100 focus-within:opacity-100 transition-opacity"
    >
      <UButton
        icon="i-lucide-settings-2"
        size="xs"
        color="neutral"
        variant="subtle"
        :aria-label="$t('widget.edit')"
        @click="emit('edit')"
      />
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        color="error"
        variant="subtle"
        :aria-label="$t('widget.remove')"
        @click="emit('remove')"
      />
    </div>

    <DashboardWidgetMonitor
      v-if="widget.type === 'monitor'"
      :widget="widget"
      :monitors="monitors"
    />
    <DashboardWidgetUptimeSummary
      v-else-if="widget.type === 'uptime-summary'"
      :widget="widget"
      :monitors="monitors"
    />
    <DashboardWidgetLatencyChart
      v-else-if="widget.type === 'latency-chart'"
      :widget="widget"
      :monitors="monitors"
    />
    <DashboardWidgetStatusOverview
      v-else-if="widget.type === 'status-overview'"
      :widget="widget"
      :monitors="monitors"
    />
    <DashboardWidgetHeading
      v-else-if="widget.type === 'heading'"
      :widget="widget"
    />
  </div>
</template>
