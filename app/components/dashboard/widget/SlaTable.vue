<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { STATS_RANGE_SECONDS } from '#shared/utils/stats'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatDuration, formatUptime } = useFormatters()
const { scoped, scopedIds, isAll } = useWidgetScope(() => props.widget)

const range = computed<StatsRange>(() => props.widget.config.range ?? WIDGET_CONFIG_DEFAULTS.range)
const target = computed(() => props.widget.config.target ?? WIDGET_CONFIG_DEFAULTS.target)

const { byMonitor } = useScopeUptime(scopedIds, isAll, range)

interface SlaRow {
  monitor: MonitorWithState
  ratio: number | null
  /** Seconds of downtime the target still allows, negative once overspent. */
  budgetLeftSeconds: number
  /** Share of the error budget already used, clamped to the bar's range. */
  used: number
}

/**
 * The budget is the downtime the target permits over the window. Spending it is
 * the number that decides whether a service is in trouble, which a bare
 * percentage hides: 99.8 % reads harmless until it is 99.9 % over 30 days.
 */
const rows = computed<SlaRow[]>(() => scoped.value
  .map((monitor) => {
    const ratio = byMonitor.value.get(monitor.id)?.ratio ?? null
    const allowed = (1 - target.value) * STATS_RANGE_SECONDS[range.value]
    const spent = ratio === null ? 0 : (1 - ratio) * STATS_RANGE_SECONDS[range.value]

    return {
      monitor,
      ratio,
      budgetLeftSeconds: Math.round(allowed - spent),
      used: allowed > 0 ? Math.min(1, spent / allowed) : (spent > 0 ? 1 : 0)
    }
  })
  .sort((a, b) => (a.ratio ?? 1) - (b.ratio ?? 1) || a.monitor.name.localeCompare(b.monitor.name))
  .slice(0, props.widget.config.limit ?? WIDGET_CONFIG_DEFAULTS.limit))

function budgetLabel(row: SlaRow): string {
  return row.budgetLeftSeconds < 0
    ? t('widget.sla.budgetOver', { duration: formatDuration(-row.budgetLeftSeconds) })
    : t('widget.sla.budgetLeft', { duration: formatDuration(row.budgetLeftSeconds) })
}

function tone(row: SlaRow): string {
  if (row.ratio === null) {
    return 'text-dimmed'
  }

  return row.ratio >= target.value ? 'text-success' : 'text-error'
}

const title = computed(() => props.widget.config.title || t('widget.type.sla-table'))
const caption = computed(() => `${formatUptime(target.value)} · ${t(`range.${range.value}`)}`)
</script>

<template>
  <DashboardWidgetShell
    :title="title"
    :caption="caption"
    :empty="!rows.length"
    :empty-label="$t('widget.list.noMonitors')"
    empty-icon="i-lucide-target"
  >
    <ul class="flex flex-col">
      <li
        v-for="row in rows"
        :key="row.monitor.id"
        class="py-1 border-b border-default/50 last:border-0"
      >
        <div class="flex items-center gap-2">
          <NuxtLink
            :to="`/monitors/${row.monitor.id}`"
            class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors truncate-target"
          >
            {{ row.monitor.name }}
          </NuxtLink>
          <span
            class="text-sm font-medium tabular-nums shrink-0 w-20 text-right"
            :class="tone(row)"
          >
            {{ formatUptime(row.ratio) }}
          </span>
          <!--
            Signed rather than spelled out: the sentence around the number wraps
            in German at any column width the row can spare, and the tooltip
            carries the wording the sign stands for.
          -->
          <span
            class="hidden @[26rem]:inline text-xs tabular-nums shrink-0 w-20 text-right whitespace-nowrap"
            :class="row.budgetLeftSeconds < 0 ? 'text-error' : 'text-dimmed'"
            :title="budgetLabel(row)"
          >
            {{ row.budgetLeftSeconds < 0 ? '−' : '' }}{{ formatDuration(Math.abs(row.budgetLeftSeconds)) }}
          </span>
        </div>
        <div class="hidden @[20rem]:block mt-1 h-1 rounded-full bg-elevated overflow-hidden">
          <div
            class="h-full rounded-full"
            :class="row.budgetLeftSeconds < 0 ? 'bg-error' : 'bg-primary'"
            :style="{ width: `${Math.max(2, row.used * 100)}%` }"
          />
        </div>
      </li>
    </ul>
  </DashboardWidgetShell>
</template>
