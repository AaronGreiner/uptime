<script setup lang="ts">
import type { Heartbeat } from '#shared/types/monitor'
import { HEARTBEAT_BAR_CLASS, HEARTBEAT_ROW_CLASS, heartbeatCountForWidth } from '#shared/utils/monitor'

const props = defineProps<{
  monitorId: number
  heartbeats: Heartbeat[]
}>()

const { formatDateTime, formatLatency } = useFormatters()
const row = useTemplateRef<HTMLElement>('row')
const requiredCount = ref(1)
const { heartbeats, ensure } = useHeartbeatHistory(
  () => props.monitorId,
  () => props.heartbeats
)

const hovered = ref<Heartbeat | null>(null)
const tooltipReference = shallowRef<HTMLElement>()

function onEnter(event: MouseEvent, heartbeat: Heartbeat) {
  tooltipReference.value = event.currentTarget as HTMLElement
  hovered.value = heartbeat
}

function loadToWidth(width: number) {
  requiredCount.value = heartbeatCountForWidth(width)

  if (requiredCount.value > props.heartbeats.length) {
    void ensure(requiredCount.value)
  }
}

onMounted(() => {
  const element = row.value

  if (!element) {
    return
  }

  loadToWidth(element.clientWidth)

  const observer = new ResizeObserver(([entry]) => {
    loadToWidth(entry?.contentRect.width ?? element.clientWidth)
  })

  observer.observe(element)
  onScopeDispose(() => observer.disconnect())
})

const stopResume = useLive().onResumed(() => {
  if (requiredCount.value > props.heartbeats.length) {
    void ensure(requiredCount.value, true)
  }
})

onScopeDispose(stopResume)
</script>

<template>
  <AppChartTooltip
    :open="hovered !== null"
    :reference="tooltipReference"
    @update:open="!$event && (hovered = null)"
  >
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
      ref="row"
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
          monitorStatusBackgroundClass(heartbeat.reportedStatus),
          hovered && hovered.id !== heartbeat.id ? 'opacity-40' : 'opacity-100'
        ]"
        @mouseenter="onEnter($event, heartbeat)"
      />
      <div
        v-if="!heartbeats.length"
        class="h-4 w-full self-end rounded-[2px] bg-elevated"
      />
    </div>

    <template #content>
      <div
        v-if="hovered"
        class="space-y-1"
      >
        <div class="text-dimmed tabular-nums">
          {{ formatDateTime(hovered.checkedAt) }}
        </div>
        <div :class="monitorStatusTextClass(hovered.reportedStatus)">
          {{ $t(`status.${hovered.reportedStatus}`) }}
          <span
            v-if="hovered.latencyMs !== null"
            class="tabular-nums"
          > · {{ formatLatency(hovered.latencyMs) }}</span>
        </div>
        <div
          v-if="hovered.message"
          class="text-muted"
        >
          {{ hovered.message }}
        </div>
      </div>
    </template>
  </AppChartTooltip>
</template>
