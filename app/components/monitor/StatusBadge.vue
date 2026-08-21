<script setup lang="ts">
import type { MonitorStatus } from '#shared/types/monitor'

const props = withDefaults(defineProps<{
  status: MonitorStatus
  size?: 'sm' | 'md' | 'lg'
  variant?: 'subtle' | 'soft' | 'solid' | 'outline'
  mobileIconOnly?: boolean
}>(), {
  size: 'sm',
  variant: 'subtle',
  mobileIconOnly: false
})

const color = computed(() => monitorStatusColor(props.status))
const icon = computed(() => monitorStatusMorphIcon(props.status))
</script>

<template>
  <UBadge
    :color="color"
    :variant="variant"
    :size="size"
    :label="$t(`status.${status}`)"
    :aria-label="$t(`status.${status}`)"
    :ui="mobileIconOnly ? { base: 'px-1.5 sm:px-2', label: 'hidden sm:inline' } : undefined"
    class="transition-colors"
  >
    <template #leading="{ ui }">
      <AppMorphIcon
        :name="icon"
        :class="ui.leadingIcon({ class: status === 'pending' ? 'animate-spin' : '' })"
      />
    </template>
  </UBadge>
</template>
