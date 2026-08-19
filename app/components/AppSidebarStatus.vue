<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const { data: summary } = useStatusSummary()
const { formatUptime } = useFormatters()

const tone = computed(() => {
  if (!summary.value.total) {
    return { text: 'text-dimmed', dot: 'bg-muted', bar: 'bg-muted' }
  }

  if (summary.value.down > 0) {
    return { text: 'text-error', dot: 'bg-error', bar: 'bg-error' }
  }

  if (summary.value.pending > 0) {
    return { text: 'text-warning', dot: 'bg-warning', bar: 'bg-warning' }
  }

  return { text: 'text-success', dot: 'bg-success', bar: 'bg-success' }
})

const headline = computed(() => {
  if (!summary.value.total) {
    return { key: 'sidebar.empty', count: 0 }
  }

  if (summary.value.down > 0) {
    return { key: 'sidebar.someDown', count: summary.value.down }
  }

  if (summary.value.pending > 0) {
    return { key: 'sidebar.somePending', count: summary.value.pending }
  }

  return { key: 'sidebar.allUp', count: 0 }
})

/** Share of monitors currently up, used for the bar width. */
const upRatio = computed(() => summary.value.total ? summary.value.up / summary.value.total : 0)
</script>

<template>
  <UTooltip
    v-if="collapsed"
    :text="$t(headline.key, headline.count)"
    :content="{ side: 'right' }"
  >
    <NuxtLink
      to="/monitors"
      class="flex justify-center py-2"
      :aria-label="$t(headline.key, headline.count)"
    >
      <span class="relative flex size-2.5">
        <span
          class="absolute inline-flex size-full rounded-full opacity-60 animate-ping"
          :class="tone.dot"
        />
        <span
          class="relative inline-flex size-2.5 rounded-full"
          :class="tone.dot"
        />
      </span>
    </NuxtLink>
  </UTooltip>

  <NuxtLink
    v-else
    to="/monitors"
    class="block rounded-lg bg-elevated/50 ring ring-default p-3 hover:bg-elevated transition-colors"
  >
    <p
      class="flex items-center gap-2 text-sm font-medium"
      :class="tone.text"
    >
      <span class="relative flex size-2 shrink-0">
        <span
          class="absolute inline-flex size-full rounded-full opacity-60 animate-ping"
          :class="tone.dot"
        />
        <span
          class="relative inline-flex size-2 rounded-full"
          :class="tone.dot"
        />
      </span>
      <span class="truncate-target">{{ $t(headline.key, headline.count) }}</span>
    </p>

    <p class="mt-1 text-xs text-dimmed tabular-nums">
      {{ $t('sidebar.upOfTotal', { up: summary.up, total: summary.total }) }}
      <template v-if="summary.uptime24h !== null">
        · {{ formatUptime(summary.uptime24h) }}
      </template>
    </p>

    <div class="mt-2.5 h-1 rounded-full bg-accented overflow-hidden">
      <div
        class="h-full rounded-full transition-[width] duration-500"
        :class="tone.bar"
        :style="{ width: `${Math.round(upRatio * 100)}%` }"
      />
    </div>
  </NuxtLink>
</template>
