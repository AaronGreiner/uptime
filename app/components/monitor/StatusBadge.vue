<script setup lang="ts">
import type { MaintenanceStatus } from '#shared/types/maintenance'
import type { MonitorStatus } from '#shared/types/monitor'

const props = withDefaults(defineProps<{
  status: MonitorStatus
  /**
   * Turns the badge into its own tooltip while a window is open. `Maintenance`
   * on its own does not say when it ends, and the badge is the one thing about
   * that state that is on screen in every list and every card.
   */
  maintenance?: MaintenanceStatus | null
  size?: 'sm' | 'md' | 'lg'
  variant?: 'subtle' | 'soft' | 'solid' | 'outline'
  mobileIconOnly?: boolean
}>(), {
  maintenance: null,
  size: 'sm',
  variant: 'subtle',
  mobileIconOnly: false
})

const color = computed(() => monitorStatusColor(props.status))
const icon = computed(() => monitorStatusMorphIcon(props.status))

const { label } = useMaintenanceLabel()

const hint = computed(() => (props.status === 'maintenance' ? label(props.maintenance) : null))
</script>

<template>
  <UTooltip
    :text="hint ?? ''"
    :disabled="!hint"
  >
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
  </UTooltip>
</template>
