<script setup lang="ts">
const { data: summary } = useStatusSummary()

const tone = computed(() => {
  if (!summary.value.total) {
    return { color: 'text-dimmed', dot: 'bg-muted' }
  }

  if (summary.value.down > 0) {
    return { color: 'text-error', dot: 'bg-error' }
  }

  if (summary.value.pending > 0) {
    return { color: 'text-warning', dot: 'bg-warning' }
  }

  return { color: 'text-success', dot: 'bg-success' }
})
</script>

<template>
  <UButton
    to="/monitors"
    variant="ghost"
    color="neutral"
    size="sm"
    class="hidden md:inline-flex gap-2 font-normal"
  >
    <span class="relative flex size-2">
      <span
        class="absolute inline-flex size-full rounded-full opacity-60 animate-ping"
        :class="tone.dot"
      />
      <span
        class="relative inline-flex size-2 rounded-full"
        :class="tone.dot"
      />
    </span>
    <span :class="tone.color">
      {{ summary.up }}/{{ summary.total }}
    </span>
    <span class="text-dimmed">{{ $t('status.up').toLowerCase() }}</span>
  </UButton>
</template>
