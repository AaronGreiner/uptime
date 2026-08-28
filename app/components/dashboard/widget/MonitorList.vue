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
).slice(0, props.widget.config.limit ?? WIDGET_CONFIG_DEFAULTS.limit))

const title = computed(() => props.widget.config.title || t('widget.type.monitor-list'))
const caption = computed(() => t('monitor.count', scoped.value.length))
</script>

<template>
  <DashboardWidgetShell
    :title="title"
    :caption="caption"
    :empty="!rows.length"
    :empty-label="$t('widget.list.noMonitors')"
    empty-icon="i-lucide-list"
  >
    <ul class="flex flex-col">
      <li
        v-for="monitor in rows"
        :key="monitor.id"
        class="flex items-center gap-2 py-1 border-b border-default/50 last:border-0"
      >
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
      </li>
    </ul>
  </DashboardWidgetShell>
</template>
