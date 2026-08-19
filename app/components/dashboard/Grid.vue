<script setup lang="ts">
import { GridLayout } from 'grid-layout-plus'
import type { LayoutItem } from 'grid-layout-plus'
import type { DashboardWidget, DashboardWithWidgets, GridBreakpoint, WidgetLayout } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import {
  GRID_BREAKPOINTS,
  GRID_BREAKPOINT_WIDTHS,
  GRID_COLUMNS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  WIDGET_DEFAULT_SIZE
} from '#shared/utils/grid'

const props = defineProps<{
  dashboard: DashboardWithWidgets
  monitors: MonitorWithState[]
  editing: boolean
}>()

const emit = defineEmits<{
  editWidget: [widget: DashboardWidget]
  removeWidget: [widget: DashboardWidget]
}>()

const { t } = useI18n()
const toast = useToast()

type BreakpointLayouts = Record<GridBreakpoint, LayoutItem[]>

function buildLayouts(): BreakpointLayouts {
  return GRID_BREAKPOINTS.reduce((result, breakpoint) => {
    result[breakpoint] = props.dashboard.widgets.map((widget) => {
      const bounds = WIDGET_DEFAULT_SIZE[widget.type]
      const columns = GRID_COLUMNS[breakpoint]

      return {
        i: String(widget.id),
        ...widget.layout[breakpoint],
        minW: Math.min(bounds.minW, columns),
        minH: bounds.minH
      }
    })

    return result
  }, {} as BreakpointLayouts)
}

const layouts = ref<BreakpointLayouts>(buildLayouts())
const currentBreakpoint = ref<GridBreakpoint>('lg')
// grid-layout-plus mutates this array in place, so it must stay the very same
// reference that also sits in `layouts`.
const activeLayout = ref<LayoutItem[]>(layouts.value.lg)

const widgetsById = computed(() => new Map(props.dashboard.widgets.map(widget => [String(widget.id), widget])))

/** Serialised layout as last confirmed by the server, used to skip idle saves. */
const persisted = ref(serializeLayouts(layouts.value))

function serializeLayouts(source: BreakpointLayouts): string {
  return JSON.stringify(GRID_BREAKPOINTS.map(breakpoint => source[breakpoint]
    .map(item => [item.i, item.x, item.y, item.w, item.h])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))))
}

watch(() => props.dashboard.widgets, () => {
  layouts.value = buildLayouts()
  activeLayout.value = layouts.value[currentBreakpoint.value]
  persisted.value = serializeLayouts(layouts.value)
}, { deep: true })

function onBreakpointChanged(breakpoint: GridBreakpoint, layout: LayoutItem[]) {
  currentBreakpoint.value = breakpoint
  layouts.value[breakpoint] = layout
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const saving = ref(false)

function onLayoutUpdated(layout: LayoutItem[]) {
  layouts.value[currentBreakpoint.value] = layout

  if (!props.editing) {
    return
  }

  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(saveLayout, 700)
}

async function saveLayout() {
  const signature = serializeLayouts(layouts.value)

  if (signature === persisted.value || saving.value) {
    return
  }

  saving.value = true

  try {
    await $fetch(`/api/dashboards/${props.dashboard.id}/layout`, {
      method: 'PUT',
      body: {
        widgets: props.dashboard.widgets.map(widget => ({
          id: widget.id,
          layout: collectWidgetLayout(String(widget.id), widget.layout)
        }))
      }
    })

    persisted.value = signature
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

/** Reads the current position of one widget across every breakpoint. */
function collectWidgetLayout(id: string, fallback: WidgetLayout): WidgetLayout {
  return GRID_BREAKPOINTS.reduce((result, breakpoint) => {
    const item = layouts.value[breakpoint].find(entry => String(entry.i) === id)

    result[breakpoint] = item
      ? { x: item.x, y: item.y, w: item.w, h: item.h }
      : fallback[breakpoint]

    return result
  }, {} as WidgetLayout)
}

// A pending drag must not be lost when edit mode is switched off.
watch(() => props.editing, (editing) => {
  if (!editing) {
    saveLayout()
  }
})

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
})
</script>

<template>
  <ClientOnly>
    <GridLayout
      v-model:layout="activeLayout"
      :responsive="true"
      :responsive-layouts="layouts"
      :breakpoints="GRID_BREAKPOINT_WIDTHS"
      :cols="GRID_COLUMNS"
      :row-height="GRID_ROW_HEIGHT"
      :margin="GRID_MARGIN"
      :is-draggable="editing"
      :is-resizable="editing"
      :vertical-compact="true"
      class="-mx-2"
      @breakpoint-changed="onBreakpointChanged"
      @layout-updated="onLayoutUpdated"
    >
      <template #item="{ item }">
        <DashboardWidgetView
          v-if="widgetsById.get(String(item.i))"
          :widget="widgetsById.get(String(item.i))!"
          :monitors="monitors"
          :editing="editing"
          @edit="emit('editWidget', widgetsById.get(String(item.i))!)"
          @remove="emit('removeWidget', widgetsById.get(String(item.i))!)"
        />
      </template>
    </GridLayout>

    <template #fallback>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <USkeleton
          v-for="widget in dashboard.widgets"
          :key="widget.id"
          class="h-40 w-full"
        />
      </div>
    </template>
  </ClientOnly>
</template>
