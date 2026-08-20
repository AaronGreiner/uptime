<script setup lang="ts">
import type { MonitorWithState } from '#shared/types/monitor'

const props = withDefaults(defineProps<{
  monitor: MonitorWithState
  heartbeatCount?: number
  /** Hides the pulse bar and the metric row for very small grid cells. */
  dense?: boolean
  /** Breadcrumb of the owning group, shown where the card stands on its own. */
  groupPath?: string
}>(), {
  heartbeatCount: 40,
  dense: false,
  groupPath: undefined
})

const { formatLatency, formatUptime, formatRelativeTime } = useFormatters()

const target = computed(() => monitorTarget(props.monitor))
</script>

<template>
  <UCard
    variant="outline"
    class="h-full"
    :ui="{ root: 'flex flex-col overflow-hidden @container', body: 'flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto' }"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p
          v-if="groupPath"
          class="text-xs text-dimmed truncate-target"
          :title="groupPath"
        >
          {{ groupPath }}
        </p>
        <NuxtLink
          :to="`/monitors/${monitor.id}`"
          class="font-medium text-highlighted hover:text-primary transition-colors truncate-target block"
        >
          {{ monitor.name }}
        </NuxtLink>
        <p
          class="text-sm text-dimmed truncate-target"
          :title="target"
        >
          {{ target }}
        </p>
      </div>

      <div class="flex items-center gap-1 shrink-0">
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
      :heartbeats="monitor.recentHeartbeats"
      :count="heartbeatCount"
      :show-legend="!dense"
    />
  </UCard>
</template>
