<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

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

const title = computed(() => props.widget.config.title || t('widget.type.incident-feed'))
const caption = computed(() => failing.value.length ? t('monitor.downCount', failing.value.length) : undefined)
</script>

<template>
  <DashboardWidgetShell
    :title="title"
    :dense="widget.height === 'compact'"
    :caption="caption"
    :empty="!failing.length"
    :empty-label="$t('widget.incidents.allClear')"
    empty-icon="i-lucide-circle-check"
  >
    <DashboardWidgetList
      :items="failing"
      :item-key="monitor => monitor.id"
      :height="widget.height"
      class="auto-rows-[45px] @[14rem]:auto-rows-[29px] @[22rem]:auto-rows-[45px]"
    >
      <template #default="{ item: monitor }">
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 @[14rem]:flex">
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
          <span class="col-start-2 text-xs text-muted tabular-nums shrink-0">
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
      </template>
    </DashboardWidgetList>
  </DashboardWidgetShell>
</template>
