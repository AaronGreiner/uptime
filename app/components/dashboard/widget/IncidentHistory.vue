<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { Incident } from '#shared/types/incident'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { widgetListFetchLimit } from '#shared/utils/grid'
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
const limit = computed(() => widgetListFetchLimit(props.widget.height))

const { data, status } = useScopeIncidents(scopedIds, isAll, range, limit)

const monitorsById = computed(() => new Map(props.monitors.map(monitor => [monitor.id, monitor])))

function duration(incident: Incident): number {
  return Math.max(0, (incident.endedAt ?? Math.floor(now.value / 1000)) - incident.startedAt)
}

const title = computed(() => props.widget.config.title || t('widget.type.incident-history'))
</script>

<template>
  <DashboardWidgetShell
    list
    :title="title"
    :dense="widget.height === 'compact'"
    :caption="$t(`range.${range}`)"
    :empty="status !== 'pending' && !data?.incidents.length"
    :empty-label="$t('widget.incidents.noneInRange')"
    empty-icon="i-lucide-circle-check"
  >
    <DashboardWidgetList
      :items="data?.incidents ?? []"
      :item-key="incident => `${incident.monitorId}-${incident.startedAt}`"
      :height="widget.height"
      class="auto-rows-[61px] @[14rem]:auto-rows-[45px]"
    >
      <template #default="{ item: incident }">
        <div class="flex flex-wrap @[14rem]:flex-nowrap items-center gap-x-2">
          <NuxtLink
            :to="`/monitors/${incident.monitorId}`"
            class="basis-full @[14rem]:basis-auto flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors truncate-target"
          >
            <MonitorPathLabel
              v-if="monitorsById.get(incident.monitorId)"
              :monitor="monitorsById.get(incident.monitorId)"
            />
            <template v-else>
              {{ `#${incident.monitorId}` }}
            </template>
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
      </template>
    </DashboardWidgetList>
  </DashboardWidgetShell>
</template>
