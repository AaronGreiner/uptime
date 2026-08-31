<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatDuration, formatNumber } = useFormatters()
const { scopedIds, isAll } = useWidgetScope(() => props.widget)

const range = computed<StatsRange>(() => props.widget.config.range ?? WIDGET_CONFIG_DEFAULTS.range)
const compact = computed(() => props.widget.height === 'compact')

// Only the figures are wanted here, so the list is kept as short as the API allows.
const { data } = useScopeIncidents(scopedIds, isAll, range, 1)

const summary = computed(() => data.value.summary)

function duration(seconds: number | null): string {
  return seconds === null ? '—' : formatDuration(seconds)
}

const tiles = computed(() => [
  {
    key: 'count',
    labelKey: 'widget.reliability.incidents',
    value: formatNumber(summary.value.count),
    class: summary.value.count ? 'text-highlighted' : 'text-success'
  },
  {
    key: 'downtime',
    labelKey: 'widget.reliability.downtime',
    value: duration(summary.value.totalDownSeconds),
    class: summary.value.totalDownSeconds ? 'text-error' : 'text-success'
  },
  {
    key: 'mttr',
    labelKey: 'widget.reliability.mttr',
    value: duration(summary.value.mttrSeconds),
    class: 'text-highlighted'
  },
  {
    key: 'mtbf',
    labelKey: 'widget.reliability.mtbf',
    value: duration(summary.value.mtbfSeconds),
    class: 'text-highlighted'
  },
  {
    key: 'longest',
    labelKey: 'widget.reliability.longest',
    value: duration(summary.value.longestSeconds),
    class: 'text-highlighted'
  }
])

const title = computed(() => props.widget.config.title || t('widget.type.reliability-kpis'))
</script>

<template>
  <UCard
    variant="outline"
    class="h-full @container"
    :ui="{
      root: 'flex flex-col overflow-hidden',
      body: compact
        ? 'px-3 py-2 sm:px-4 sm:py-2 flex-1 flex flex-col justify-center gap-1 min-h-0 overflow-hidden'
        : 'p-3 sm:p-4 flex-1 flex flex-col justify-center gap-2 @[22rem]:gap-4 min-h-0 overflow-hidden'
    }"
  >
    <div class="flex items-baseline justify-between gap-3">
      <p
        class="font-medium text-highlighted truncate-target"
        :class="compact ? 'text-sm leading-4' : ''"
      >
        {{ title }}
      </p>
      <p class="text-[0.6875rem] @[24rem]:text-xs text-dimmed shrink-0">
        {{ $t(`range.${range}`) }}
      </p>
    </div>

    <div
      class="grid grid-cols-1 @[22rem]:grid-cols-3 @[42rem]:grid-cols-5"
      :class="compact ? 'gap-x-3 gap-y-1 @[42rem]:gap-2' : 'gap-1 @[22rem]:gap-4'"
    >
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="min-w-0 flex items-baseline justify-between gap-2 @[22rem]:block"
      >
        <p
          class="min-w-0 text-muted truncate-target"
          :class="compact ? 'text-xs leading-4' : 'text-sm leading-tight'"
          :title="$t(tile.labelKey)"
        >
          {{ $t(tile.labelKey) }}
        </p>
        <p
          class="shrink-0 font-semibold tabular-nums leading-4 @[22rem]:leading-5"
          :class="[tile.class, compact ? 'text-sm @[22rem]:text-lg' : 'text-base @[22rem]:text-xl @[26rem]:text-2xl']"
        >
          {{ tile.value }}
        </p>
      </div>
    </div>
  </UCard>
</template>
