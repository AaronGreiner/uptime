<script setup lang="ts">
/**
 * Picks the curves of the response time chart. The setting is one value for the
 * whole browser, so this control is the same wherever it is offered — the chart
 * header on the detail page, a latency widget, the settings page.
 */
withDefaults(defineProps<{
  size?: 'xs' | 'sm' | 'md'
  /** Fills the available width, for a form field rather than a toolbar. */
  block?: boolean
}>(), {
  size: 'sm',
  block: false
})

const { entries, shows, toggle, isLocked } = useLatencySeriesToggle()
</script>

<template>
  <!--
    One joined group rather than three loose buttons: the three curves are one
    setting, and a segmented control says so at any size — next to the selects
    of the settings page as much as in a widget header.
  -->
  <UFieldGroup
    :size="size"
    :class="block ? 'w-full' : ''"
    role="group"
    :aria-label="$t('monitor.detail.latencySeries')"
  >
    <UButton
      v-for="entry in entries"
      :key="entry"
      :label="$t(`monitor.latencySeries.${entry}`)"
      :color="shows(entry) ? 'primary' : 'neutral'"
      :variant="shows(entry) ? 'subtle' : 'outline'"
      :aria-pressed="shows(entry)"
      :disabled="isLocked(entry)"
      :class="block ? 'flex-1 justify-center' : ''"
      @click="toggle(entry)"
    />
  </UFieldGroup>
</template>
