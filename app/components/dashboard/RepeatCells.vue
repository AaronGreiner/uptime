<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { repeatChildWidget, widgetChildren } from '#shared/utils/widget'

/**
 * A repeat block as the reader sees it: its children, once per monitor.
 *
 * The cells are emitted as siblings rather than wrapped, so they are ordinary
 * items of the dashboard grid and flow exactly like every hand-placed widget.
 * That is why a block needs no geometry of its own — no nested grid, no row
 * span, nothing that would have to know the breakpoint.
 */
const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { scoped } = useWidgetScope(() => props.widget)

const children = computed(() => widgetChildren(props.widget.config))

/**
 * The covered monitors as a plain string, which is what keeps the cells below
 * from being rebuilt on every check: the scope resolves against the shared
 * monitor list, so it yields a fresh array whenever a heartbeat patches it,
 * while the ids in it change only when a monitor joins or leaves the block.
 */
const monitorIds = computed(() => sortMonitors(scoped.value, props.widget.config.sort)
  .map(monitor => monitor.id)
  .join(','))

const cells = computed(() => {
  const ids = monitorIds.value ? monitorIds.value.split(',').map(Number) : []

  return ids.flatMap(monitorId => children.value.map((child, index) => ({
    key: `${props.widget.id}:${index}:${monitorId}`,
    widget: repeatChildWidget(props.widget, child, monitorId)
  })))
})
</script>

<template>
  <DashboardWidgetView
    v-for="cell in cells"
    :key="cell.key"
    :widget="cell.widget"
    :monitors="monitors"
    :editing="false"
  />
</template>
