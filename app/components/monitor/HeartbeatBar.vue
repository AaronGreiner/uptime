<script setup lang="ts">
import type { Heartbeat } from '#shared/types/monitor'
import { HEARTBEAT_BAR_CLASS, HEARTBEAT_ROW_CLASS } from '#shared/utils/monitor'

withDefaults(defineProps<{
  heartbeats: Heartbeat[]
  showLegend?: boolean
}>(), {
  showLegend: true
})

const { formatDateTime, formatLatency } = useFormatters()

const hovered = ref<Heartbeat | null>(null)
</script>

<template>
  <div class="flex flex-col gap-1.5 @container">
    <!--
      The bars are a fixed size and the row decides how many of them fit, not how
      wide each one is: the same stretch of history then reads the same width in
      a dashboard cell, in the list and on the detail page.

      Reversed rather than right aligned. A reversed row packs at its start,
      which is the right edge, so the newest check is always in view and older
      ones run off to the left — where a container that is a scroll container,
      as `overflow-hidden` makes it, would otherwise flip an overflowing
      `justify-end` back to the start and clip the newest instead. The fade
      turns the cut into an edge rather than half a bar.
    -->
    <div
      class="flex flex-row-reverse h-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_0.75rem)]"
      :class="HEARTBEAT_ROW_CLASS"
      @mouseleave="hovered = null"
    >
      <div
        v-for="heartbeat in [...heartbeats].reverse()"
        :key="heartbeat.id"
        class="h-full shrink-0 rounded-[2px] transition-opacity duration-150"
        :class="[
          HEARTBEAT_BAR_CLASS,
          heartbeat.status === 'up' ? 'bg-success' : 'bg-error',
          hovered && hovered.id !== heartbeat.id ? 'opacity-40' : 'opacity-100'
        ]"
        @mouseenter="hovered = heartbeat"
      />
      <div
        v-if="!heartbeats.length"
        class="h-4 w-full self-end rounded-[2px] bg-elevated"
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
      <!--
        Nothing but the reserved height until a bar is hovered. How far back the
        row reaches depends on how many bars fit, which it is never told, so
        naming the oldest check in the list would label a bar that may well be
        off the left edge — and the newest one is already on the card.
      -->
    </div>
  </div>
</template>
