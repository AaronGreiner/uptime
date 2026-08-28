<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatRelativeTime } = useFormatters()
const { scoped } = useWidgetScope(() => props.widget)

/**
 * What is wrong right now, longest running first. `pending` is included on
 * purpose: a monitor working through its retries is already failing checks, and
 * the feed exists to show that before the notification goes out.
 */
const failing = computed(() => scoped.value
  .filter(monitor => monitor.state.status === 'down' || monitor.state.status === 'pending')
  .sort((a, b) => {
    const severity = Number(b.state.status === 'down') - Number(a.state.status === 'down')

    return severity || (a.state.statusChangedAt ?? 0) - (b.state.statusChangedAt ?? 0)
  }))

const rows = computed(() => failing.value.slice(0, props.widget.config.limit ?? WIDGET_CONFIG_DEFAULTS.limit))

const title = computed(() => props.widget.config.title || t('widget.type.incident-feed'))
const caption = computed(() => failing.value.length ? t('monitor.downCount', failing.value.length) : undefined)
</script>

<template>
  <DashboardWidgetShell
    :title="title"
    :caption="caption"
    :empty="!rows.length"
    :empty-label="$t('widget.incidents.allClear')"
    empty-icon="i-lucide-circle-check"
  >
    <ul class="flex flex-col">
      <li
        v-for="monitor in rows"
        :key="monitor.id"
        class="py-1 border-b border-default/50 last:border-0"
      >
        <div class="flex items-center gap-2">
          <UIcon
            :name="monitor.state.status === 'down' ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'"
            class="size-3.5 shrink-0"
            :class="monitorStatusTextClass(monitor.state.status)"
          />
          <NuxtLink
            :to="`/monitors/${monitor.id}`"
            class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors"
          >
            <MonitorPathLabel :monitor="monitor" />
          </NuxtLink>
          <span class="text-xs text-muted tabular-nums shrink-0">
            {{ formatRelativeTime(monitor.state.statusChangedAt) }}
          </span>
        </div>
        <p
          v-if="monitor.state.message"
          class="hidden @[22rem]:block ps-5.5 text-xs text-dimmed truncate-target"
          :title="monitor.state.message"
        >
          {{ monitor.state.message }}
        </p>
      </li>
    </ul>
  </DashboardWidgetShell>
</template>
