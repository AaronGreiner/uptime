<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

/** `monitors` is part of the contract every widget is rendered with. */
const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const level = computed(() => props.widget.config.level ?? 2)

const classes = computed(() => ({
  1: 'text-2xl font-semibold',
  2: 'text-lg font-semibold',
  3: 'text-sm font-medium uppercase tracking-wide text-muted'
}[level.value]))
</script>

<template>
  <div class="h-full min-w-0 flex items-end pb-2">
    <p
      class="text-highlighted truncate-target"
      :class="classes"
    >
      {{ widget.config.title || $t('widget.type.heading') }}
    </p>
  </div>
</template>
