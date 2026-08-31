<script setup lang="ts">
import type { MaintenanceStatus } from '#shared/types/maintenance'

const props = defineProps<{
  status: MaintenanceStatus
  /** Offered only where the reader can actually end it. */
  canEnd?: boolean
  ending?: boolean
}>()

defineEmits<{ end: [] }>()

const { t } = useI18n()
const { label, stale, runningFor } = useMaintenanceLabel()

const isStale = computed(() => stale(props.status))

/**
 * What the row says: how long it still has to run, or how long it has already
 * been running when nobody set an end. The amber turn is the whole warning —
 * the button beside it is what to do about it, so there is nothing to spell out.
 */
const title = computed(() => (isStale.value
  ? t('maintenance.staleTitle', { duration: runningFor(props.status) })
  : label(props.status) ?? ''))

/**
 * Why it is running, which is what tells the reader whether the button will do
 * anything: a scheduled window closes on its own and offers none. Left out when
 * both are in force, because then neither half is the whole answer.
 */
const reason = computed(() => {
  if (props.status.scheduled && props.status.manual) {
    return null
  }

  return t(props.status.scheduled ? 'maintenance.bySchedule' : 'maintenance.byHand')
})

const canEndNow = computed(() => props.canEnd && props.status.manual)
</script>

<template>
  <!--
    One row: icon, what is happening, and the way out. `horizontal` moves the
    actions out of the text column and against the trailing edge, which is what
    lets the whole notice sit in a single line of the panel.
  -->
  <UAlert
    :color="isStale ? 'warning' : 'info'"
    variant="subtle"
    orientation="horizontal"
    icon="i-lucide-wrench"
    :ui="{
      root: 'px-3 py-2 gap-2',
      icon: 'size-4',
      title: 'flex items-baseline gap-2 min-w-0'
    }"
  >
    <template #title>
      <span class="truncate-target">{{ title }}</span>
      <!-- Dropped rather than wrapped where the row runs out of width: it
           qualifies the line, it is not the line. -->
      <span
        v-if="reason"
        class="hidden sm:inline text-xs opacity-75 shrink-0"
      >{{ reason }}</span>
    </template>

    <template
      v-if="canEndNow"
      #actions
    >
      <UButton
        color="neutral"
        variant="outline"
        size="xs"
        :loading="ending"
        :label="$t('maintenance.manual.end')"
        @click="$emit('end')"
      />
    </template>
  </UAlert>
</template>
