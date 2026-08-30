<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'
import type { DashboardWidget, DashboardWithWidgets, WidgetHeight, WidgetWidth } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  dashboard: DashboardWithWidgets
  monitors: MonitorWithState[]
  editing: boolean
}>()

const emit = defineEmits<{
  editWidget: [widget: DashboardWidget]
  duplicateWidget: [widget: DashboardWidget]
  removeWidget: [widget: DashboardWidget]
}>()

const { t } = useI18n()
const toast = useToast()
const grid = useTemplateRef<HTMLElement>('grid')

function cloneWidgets(): DashboardWidget[] {
  return props.dashboard.widgets.map(widget => ({ ...widget }))
}

const widgets = ref<DashboardWidget[]>(cloneWidgets())

// Read by the widgets themselves rather than passed through their props: a
// widget carrying its own control hides it while the edit buttons are in reach.
provideWidgetEditing(() => props.editing)

/** Serialised state last confirmed by the server, used to skip idle saves. */
const persisted = ref(serializeWidgets(widgets.value))

function serializeWidgets(source: DashboardWidget[]): string {
  return JSON.stringify(source.map((widget, position) => [
    widget.id,
    position,
    widget.width,
    widget.height
  ]))
}

watch(() => props.dashboard.widgets, () => {
  widgets.value = cloneWidgets()
  persisted.value = serializeWidgets(widgets.value)
}, { deep: true })

let saveTimer: ReturnType<typeof setTimeout> | null = null
const saving = ref(false)

function scheduleSave() {
  if (!props.editing) {
    return
  }

  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(saveLayout, 700)
}

const { option: setSortableOption } = useSortable(grid, widgets, {
  handle: '[data-widget-drag]',
  disabled: !props.editing,
  animation: 180,
  onEnd: scheduleSave
})

watch(() => props.editing, (editing) => {
  setSortableOption('disabled', !editing)

  if (!editing) {
    void saveLayout()
  }
})

function resizeWidget(widget: DashboardWidget, size: { width: WidgetWidth, height: WidgetHeight }) {
  widget.width = size.width
  widget.height = size.height
  scheduleSave()
}

function moveWidget(index: number, direction: -1 | 1) {
  const target = index + direction

  if (target < 0 || target >= widgets.value.length) {
    return
  }

  const reordered = [...widgets.value]
  const [widget] = reordered.splice(index, 1)

  reordered.splice(target, 0, widget!)
  widgets.value = reordered
  scheduleSave()
}

function waitForActiveSave(): Promise<void> {
  if (!saving.value) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const stop = watch(saving, (value) => {
      if (!value) {
        stop()
        resolve()
      }
    })
  })
}

async function duplicateWidget(widget: DashboardWidget) {
  await waitForActiveSave()
  await saveLayout()

  // A failed layout request has already shown its error. Keep the current UI
  // intact instead of duplicating from older server-side positions.
  if (serializeWidgets(widgets.value) === persisted.value) {
    emit('duplicateWidget', widget)
  }
}

async function saveLayout() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  const signature = serializeWidgets(widgets.value)

  if (signature === persisted.value || saving.value) {
    return
  }

  saving.value = true

  try {
    await $fetch(`/api/dashboards/${props.dashboard.id}/layout`, {
      method: 'PUT',
      body: {
        widgets: widgets.value.map((widget, position) => ({
          id: widget.id,
          position,
          width: widget.width,
          height: widget.height
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

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
})
</script>

<template>
  <div
    ref="grid"
    class="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-x-3 gap-y-4 sm:gap-4 auto-rows-[68px] lg:auto-rows-[60px]"
  >
    <DashboardWidgetView
      v-for="(widget, index) in widgets"
      :key="widget.id"
      :widget="widget"
      :monitors="monitors"
      :editing="editing"
      @edit="emit('editWidget', widget)"
      @duplicate="duplicateWidget(widget)"
      @remove="emit('removeWidget', widget)"
      @resize="resizeWidget(widget, $event)"
      @move="moveWidget(index, $event)"
    />
  </div>
</template>
