<script setup lang="ts">
import type { Heartbeat } from '#shared/types/monitor'

const props = withDefaults(defineProps<{
  heartbeats: Heartbeat[]
  /** Bars rendered in total. Missing checks are drawn as empty slots. */
  count?: number
  showLegend?: boolean
}>(), {
  count: 40,
  showLegend: true
})

const { formatDateTime, formatLatency } = useFormatters()

/**
 * Right aligned: the newest check is always the rightmost bar, older checks pad
 * the left with placeholders so the bar keeps a stable width.
 */
const slots = computed<Array<Heartbeat | null>>(() => {
  const recent = props.heartbeats.slice(-props.count)
  const padding = Array.from({ length: Math.max(0, props.count - recent.length) }, () => null)

  return [...padding, ...recent]
})

const hovered = ref<Heartbeat | null>(null)

const oldest = computed(() => props.heartbeats.at(0) ?? null)
const newest = computed(() => props.heartbeats.at(-1) ?? null)
</script>

<template>
  <div class="flex flex-col gap-1.5 @container">
    <div
      class="flex items-end gap-px @[18rem]:gap-[2px] h-8"
      @mouseleave="hovered = null"
    >
      <div
        v-for="(heartbeat, index) in slots"
        :key="heartbeat?.id ?? `empty-${index}`"
        class="flex-1 min-w-[2px] @[18rem]:min-w-[3px] rounded-[2px] transition-[opacity,height] duration-150"
        :class="[
          heartbeat === null ? 'h-4 bg-elevated' : heartbeat.status === 'up' ? 'h-full bg-success' : 'h-full bg-error',
          hovered && heartbeat && hovered.id !== heartbeat.id ? 'opacity-40' : 'opacity-100'
        ]"
        @mouseenter="hovered = heartbeat"
      />
    </div>

    <!-- The threshold is the card's stacked header minus its padding: a cell
         that narrow is also too short to spend a row on timestamps. -->
    <div
      v-if="showLegend"
      class="hidden @[11rem]:flex items-center justify-between gap-2 text-xs text-dimmed h-4"
    >
      <template v-if="hovered">
        <span class="truncate-target">{{ formatDateTime(hovered.checkedAt) }}</span>
        <span
          class="shrink-0 tabular-nums"
          :class="hovered.status === 'up' ? 'text-success' : 'text-error'"
        >
          {{ hovered.status === 'up' ? formatLatency(hovered.latencyMs) : hovered.message }}
        </span>
      </template>
      <template v-else-if="newest">
        <span class="truncate-target hidden @[22rem]:inline">{{ formatDateTime(oldest?.checkedAt) }}</span>
        <span class="shrink-0 ml-auto">{{ formatDateTime(newest.checkedAt) }}</span>
      </template>
      <span v-else>{{ $t('monitor.detail.noHistory') }}</span>
    </div>
  </div>
</template>
