<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { Incident } from '#shared/types/incident'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatDateTime, formatDuration } = useFormatters()
const now = useNow()
const { scopedIds, isAll } = useWidgetScope(() => props.widget)

const range = computed<StatsRange>(() => props.widget.config.range ?? WIDGET_CONFIG_DEFAULTS.range)
const limit = computed(() => props.widget.config.limit ?? WIDGET_CONFIG_DEFAULTS.limit)

const { data, status } = useScopeIncidents(scopedIds, isAll, range, limit)

const namesById = computed(() => new Map(props.monitors.map(monitor => [monitor.id, monitor.name])))

function duration(incident: Incident): number {
  return Math.max(0, (incident.endedAt ?? Math.floor(now.value / 1000)) - incident.startedAt)
}

const title = computed(() => props.widget.config.title || t('widget.type.incident-history'))
</script>

<template>
  <DashboardWidgetShell
    :title="title"
    :caption="$t(`range.${range}`)"
    :empty="status !== 'pending' && !data.incidents.length"
    :empty-label="$t('widget.incidents.noneInRange')"
    empty-icon="i-lucide-circle-check"
  >
    <ul class="flex flex-col">
      <li
        v-for="incident in data.incidents"
        :key="`${incident.monitorId}-${incident.startedAt}`"
        class="py-1 border-b border-default/50 last:border-0"
      >
        <div class="flex items-center gap-2">
          <NuxtLink
            :to="`/monitors/${incident.monitorId}`"
            class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors truncate-target"
          >
            {{ namesById.get(incident.monitorId) ?? `#${incident.monitorId}` }}
          </NuxtLink>
          <span
            v-if="incident.endedAt === null"
            class="text-xs font-medium text-error shrink-0"
          >
            {{ $t('widget.incidents.ongoing') }}
          </span>
          <span
            class="text-xs tabular-nums shrink-0"
            :class="incident.endedAt === null ? 'text-error' : 'text-muted'"
          >
            <!-- A reconstructed outage is only accurate to the hour, and saying
                 so is cheaper than pretending otherwise. -->
            {{ incident.approximate ? '≈' : '' }}{{ formatDuration(duration(incident)) }}
          </span>
        </div>
        <p class="text-xs text-dimmed truncate-target">
          {{ incident.message
            ? `${formatDateTime(incident.startedAt)} · ${incident.message}`
            : formatDateTime(incident.startedAt) }}
        </p>
      </li>
    </ul>
  </DashboardWidgetShell>
</template>
