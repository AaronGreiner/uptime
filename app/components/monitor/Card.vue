<script setup lang="ts">
import type { MonitorWithState } from '#shared/types/monitor'
import { joinMonitorPath } from '#shared/utils/group'

const props = withDefaults(defineProps<{
  monitor: MonitorWithState
  /** Drops the metric row and tightens the spacing for very small grid cells. */
  dense?: boolean
  /**
   * Off where the card already stands under a heading naming its group, which
   * is the only place the breadcrumb would be repeating what is on screen.
   */
  showGroupPath?: boolean
  /** The current search, where the card is a result rather than a list entry. */
  query?: string
}>(), {
  dense: false,
  showGroupPath: true,
  query: ''
})

const { formatLatency, formatUptime, formatRelativeTime } = useFormatters()
const { groupPath, groupSegments } = useMonitorPath()

const target = computed(() => monitorTarget(props.monitor))
const path = computed(() => (props.showGroupPath ? groupPath(props.monitor) : undefined))
/** The whole path, whatever the format shortened the line above down to. */
const pathTitle = computed(() => joinMonitorPath(groupSegments(props.monitor)))

/*
 * A dashboard cell has a fixed height, so the card clips instead of scrolling.
 * Scrolling was never reachable here anyway, while a body overflowing by a
 * single rounding pixel puts a scrollbar on every tile wherever the platform
 * draws them permanently instead of as an overlay. The dense variant pairs the
 * tighter spacing with the smaller cell it is made for.
 */
const cardUi = computed(() => ({
  root: 'flex flex-col overflow-hidden @container',
  body: props.dense
    ? 'p-3 sm:p-4 flex-1 flex flex-col gap-2 min-h-0 overflow-hidden'
    : 'p-4 sm:p-6 flex-1 flex flex-col gap-3 min-h-0 overflow-hidden'
}))
</script>

<template>
  <UCard
    variant="outline"
    class="h-full"
    :ui="cardUi"
  >
    <div class="flex flex-col items-stretch gap-2 @[14rem]:flex-row @[14rem]:items-start @[14rem]:justify-between @[14rem]:gap-3">
      <div class="min-w-0 flex-1">
        <p
          v-if="path"
          class="text-xs text-dimmed truncate-target"
          :title="pathTitle"
        >
          <AppHighlight
            :text="path"
            :query="query"
          />
        </p>
        <NuxtLink
          :to="`/monitors/${monitor.id}`"
          class="font-medium text-highlighted hover:text-primary transition-colors truncate-target block"
        >
          <AppHighlight
            :text="monitor.name"
            :query="query"
          />
        </NuxtLink>
        <!-- While the header stacks, the target costs the row the pulse bar
             needs, so it returns together with the side by side header. -->
        <p
          class="hidden @[14rem]:block text-sm text-dimmed truncate-target"
          :title="target"
        >
          <AppHighlight
            :text="target"
            :query="query"
          />
        </p>
      </div>

      <div class="flex items-center gap-1 self-start shrink-0">
        <slot name="actions" />
        <MonitorStatusBadge :status="monitor.state.status" />
      </div>
    </div>

    <dl
      v-if="!dense"
      class="grid grid-cols-2 @[24rem]:grid-cols-3 gap-3 text-sm"
    >
      <div class="min-w-0">
        <dt class="text-muted text-xs truncate-target">
          {{ $t('monitor.detail.uptime') }}
        </dt>
        <dd class="font-medium tabular-nums truncate-target">
          {{ formatUptime(monitor.uptime24h.ratio) }}
        </dd>
      </div>
      <div class="min-w-0">
        <dt class="text-muted text-xs truncate-target">
          {{ $t('monitor.detail.responseTime') }}
        </dt>
        <dd class="font-medium tabular-nums truncate-target">
          {{ formatLatency(monitor.state.latencyMs) }}
        </dd>
      </div>
      <div class="min-w-0 hidden @[24rem]:block">
        <dt class="text-muted text-xs truncate-target">
          {{ $t('monitor.detail.lastCheck') }}
        </dt>
        <dd class="font-medium truncate-target">
          {{ formatRelativeTime(monitor.state.lastCheckedAt) }}
        </dd>
      </div>
    </dl>

    <MonitorHeartbeatBar
      class="mt-auto"
      :monitor-id="monitor.id"
      :heartbeats="monitor.recentHeartbeats"
      :show-legend="!dense"
    />
  </UCard>
</template>
