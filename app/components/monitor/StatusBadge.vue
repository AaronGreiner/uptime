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
const icon = computed(() => monitorStatusMorphIcon(props.status))
</script>

<template>
  <UBadge
    :color="color"
    :variant="variant"
    :size="size"
    :label="$t(`status.${status}`)"
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
