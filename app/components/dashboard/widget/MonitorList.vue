<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatLatency, formatUptime } = useFormatters()
const { scoped } = useWidgetScope(() => props.widget)

const rows = computed(() => sortMonitors(
  scoped.value,
  props.widget.config.sort ?? WIDGET_CONFIG_DEFAULTS.sort
))

const title = computed(() => props.widget.config.title || t('widget.type.monitor-list'))
const caption = computed(() => t('monitor.count', scoped.value.length))
</script>

<template>
  <DashboardWidgetShell
    list
    :title="title"
    :dense="widget.height === 'compact'"
    :caption="caption"
    :empty="!rows.length"
    :empty-label="$t('widget.list.noMonitors')"
    empty-icon="i-lucide-list"
  >
    <DashboardWidgetList
      :items="rows"
      :item-key="monitor => monitor.id"
      :height="widget.height"
    >
      <template #default="{ item: monitor }">
        <div class="flex items-center gap-2">
          <span
            class="size-2 rounded-full shrink-0"
            :class="monitorStatusBackgroundClass(monitor.state.status)"
            :title="$t(`status.${monitor.state.status}`)"
          />
          <NuxtLink
            :to="`/monitors/${monitor.id}`"
            class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors"
          >
            <MonitorPathLabel :monitor="monitor" />
          </NuxtLink>
          <span class="hidden @[20rem]:inline text-xs text-muted tabular-nums shrink-0 w-16 text-right">
            {{ formatUptime(monitor.uptime24h.ratio) }}
          </span>
          <span class="hidden @[26rem]:inline text-xs text-dimmed tabular-nums shrink-0 w-16 text-right">
            {{ formatLatency(monitor.state.latencyMs) }}
          </span>
        </div>
      </template>
    </DashboardWidgetList>
  </DashboardWidgetShell>
</template>
