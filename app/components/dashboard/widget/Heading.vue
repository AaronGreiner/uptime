<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'

const props = defineProps<{ widget: DashboardWidget }>()

const level = computed(() => props.widget.config.level ?? 2)

const classes = computed(() => ({
  1: 'text-2xl font-semibold',
  2: 'text-lg font-semibold',
  3: 'text-sm font-medium uppercase tracking-wide text-muted'
}[level.value]))
</script>

<template>
  <div class="h-full min-w-0 flex items-center">
    <p
      class="text-highlighted truncate-target"
      :class="classes"
    >
      {{ widget.config.title || $t('widget.type.heading') }}
    </p>
  </div>
</template>
