<script setup lang="ts">
import { NuxtLink } from '#components'
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorStatus, MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { formatUptime, formatNumber } = useFormatters()
const { scoped } = useWidgetScope(() => props.widget)
const compact = computed(() => props.widget.height === 'compact')

// The cell height is fixed, so the body clips rather than growing a scrollbar
// that centred content could never scroll into view anyway.
const cardUi = computed(() => ({
  root: 'flex @container',
  body: compact.value
    ? 'flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-hidden px-3 py-2 sm:p-4'
    : 'flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-hidden'
}))

const counts = computed(() => scoped.value.reduce((totals, monitor) => {
  totals[monitor.state.status] += 1

  return totals
}, { up: 0, down: 0, pending: 0, paused: 0 } as Record<MonitorStatus, number>))

/**
 * Checks that succeeded over checks that ran, not the mean of the per-monitor
 * percentages: a monitor checked every 30 seconds would otherwise weigh the same
 * as one checked every five minutes.
 */
const uptime = computed(() => {
  const totals = scoped.value.reduce((sums, monitor) => ({
    up: sums.up + monitor.uptime24h.upCount,
    total: sums.total + monitor.uptime24h.upCount + monitor.uptime24h.downCount
  }), { up: 0, total: 0 })

  return totals.total > 0 ? totals.up / totals.total : null
})

/** Filtering the monitor list is what the reader wants next from a count. */
function statusLink(status: MonitorStatus | 'all'): string {
  const group = props.widget.config.groupId

  return `/monitors?${new URLSearchParams({
    ...(status === 'all' ? {} : { status }),
    ...(group ? { group: String(group) } : {})
  })}`
}

const tiles = computed(() => ([
  {
    key: 'total',
    labelKey: 'widget.overview.total',
    value: formatNumber(scoped.value.length),
    icon: 'i-lucide-list',
    class: 'text-highlighted',
    to: statusLink('all')
  },
  {
    key: 'up',
    labelKey: 'status.up',
    value: formatNumber(counts.value.up),
    icon: 'i-lucide-check',
    class: monitorStatusTextClass('up'),
    to: statusLink('up')
  },
  {
    key: 'down',
    labelKey: 'status.down',
    value: formatNumber(counts.value.down),
    icon: 'i-lucide-x',
    class: monitorStatusTextClass('down'),
    to: statusLink('down')
  },
  {
    key: 'pending',
    labelKey: 'status.pending',
    value: formatNumber(counts.value.pending),
    icon: 'i-lucide-triangle-alert',
    class: monitorStatusTextClass('pending'),
    to: statusLink('pending')
  },
  {
    key: 'paused',
    labelKey: 'status.paused',
    value: formatNumber(counts.value.paused),
    icon: 'i-lucide-pause',
    class: monitorStatusTextClass('paused'),
    to: statusLink('paused')
  },
  {
    key: 'uptime',
    labelKey: 'widget.overview.uptime',
    value: formatUptime(uptime.value),
    icon: 'i-lucide-activity',
    class: 'text-primary',
    to: undefined
  }
]))
</script>

<template>
  <UCard
    variant="outline"
    class="h-full"
    :ui="cardUi"
  >
    <p
      v-if="widget.config.title"
      class="font-medium text-highlighted truncate-target"
      :class="compact ? 'text-sm leading-4' : ''"
    >
      {{ widget.config.title }}
    </p>

    <div
      class="grid grid-cols-2 @[22rem]:grid-cols-3 @[46rem]:grid-cols-6"
      :class="compact ? 'gap-x-3 gap-y-1 @[46rem]:gap-2' : 'gap-3 @[22rem]:gap-4'"
    >
      <component
        :is="tile.to ? NuxtLink : 'div'"
        v-for="tile in tiles"
        :key="tile.key"
        :to="tile.to"
        class="min-w-0 rounded-md @[60rem]:flex @[60rem]:items-center @[60rem]:justify-center @[60rem]:gap-2.5"
        :class="tile.to ? 'transition-opacity hover:opacity-70' : ''"
      >
        <UIcon
          :name="tile.icon"
          class="hidden @[60rem]:block size-5 shrink-0"
          :class="tile.class"
        />

        <div class="min-w-0">
          <!--
            The labels stay at one size while the figures grow. Letting them grow
            too clipped the longest of them in German at the six column step.
          -->
          <p
            class="text-muted truncate-target"
            :class="compact ? 'text-xs leading-4' : 'text-sm leading-tight'"
            :title="$t(tile.labelKey)"
          >
            {{ $t(tile.labelKey) }}
          </p>
          <p
            class="font-semibold tabular-nums @[46rem]:text-[2rem] @[46rem]:leading-9 @[60rem]:text-4xl @[60rem]:leading-10"
            :class="[tile.class, compact ? 'text-lg leading-5' : 'text-xl @[26rem]:text-2xl']"
          >
            {{ tile.value }}
          </p>
        </div>
      </component>
    </div>
  </UCard>
</template>
