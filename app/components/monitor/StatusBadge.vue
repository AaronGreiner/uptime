<script setup lang="ts">
import type { MonitorStatus } from '#shared/types/monitor'

const props = withDefaults(defineProps<{
  status: MonitorStatus
  size?: 'sm' | 'md' | 'lg'
  variant?: 'subtle' | 'soft' | 'solid' | 'outline'
}>(), {
  size: 'sm',
  variant: 'subtle'
})

const color = computed(() => monitorStatusColor(props.status))
const icon = computed(() => monitorStatusIcon(props.status))
</script>

<template>
  <UBadge
    :color="color"
    :variant="variant"
    :size="size"
    :icon="icon"
    :label="$t(`status.${status}`)"
    :ui="{ leadingIcon: status === 'pending' ? 'animate-spin' : '' }"
  />
</template>
