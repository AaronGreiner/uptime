<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

/** `monitors` is part of the contract every widget is rendered with. */
const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const level = computed(() => props.widget.config.level ?? 2)

/**
 * A heading placed inside a repeat block is handed the monitor of its band, and
 * an untitled one then names it — which is what turns a band into a section.
 * A heading of its own never carries a monitor, so nothing else changes.
 */
const monitor = computed(() => props.widget.monitorId
  ? props.monitors.find(entry => entry.id === props.widget.monitorId) ?? null
  : null)

const classes = computed(() => ({
  1: 'text-2xl font-semibold',
  2: 'text-lg font-semibold',
  3: 'text-sm font-medium uppercase tracking-wide text-muted'
}[level.value]))
</script>

<template>
  <div class="h-full min-w-0 flex items-end pb-2">
    <MonitorPathLabel
      v-if="monitor && !widget.config.title"
      :monitor="monitor"
      class="text-highlighted"
      :class="classes"
    />
    <p
      v-else
      class="text-highlighted truncate-target"
      :class="classes"
    >
      {{ widget.config.title || $t('widget.type.heading') }}
    </p>
  </div>
</template>
