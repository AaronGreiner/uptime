<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { widgetPixelHeight, widgetPixelWidth } from '#shared/utils/grid'
import { widgetNeedsMonitor } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

/**
 * Width the preview pretends the dashboard grid has. Rendering the widget at the
 * dialog's own width would show it at a container size it never reaches on a
 * dashboard, and the widgets change their layout by container size — so the
 * preview is drawn at the real size and scaled down to fit instead.
 */
const GRID_WIDTH = 1180

const frame = useTemplateRef<HTMLElement>('frame')
const available = ref(GRID_WIDTH)

/**
 * Rendering the widget without its monitor would show the "no longer exists"
 * state, which is a different thing from not having picked one yet.
 */
const awaitingMonitor = computed(() => widgetNeedsMonitor(props.widget.type) && !props.widget.monitorId)

const width = computed(() => widgetPixelWidth(props.widget.width, GRID_WIDTH))
const height = computed(() => widgetPixelHeight(props.widget.height))
const scale = computed(() => Math.min(1, available.value / width.value))

onMounted(() => {
  const element = frame.value

  if (!element) {
    return
  }

  const observer = new ResizeObserver(([entry]) => {
    available.value = entry?.contentRect.width ?? GRID_WIDTH
  })

  observer.observe(element)
  onScopeDispose(() => observer.disconnect())
})
</script>

<template>
  <div
    ref="frame"
    class="w-full overflow-hidden"
    :style="{ height: `${height * scale}px` }"
  >
    <div
      class="origin-top-left"
      :style="{ width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` }"
    >
      <div
        v-if="awaitingMonitor"
        class="size-full grid place-items-center rounded-lg border border-dashed border-default text-sm text-dimmed"
      >
        {{ $t('widget.preview.selectMonitor') }}
      </div>
      <DashboardWidgetBody
        v-else
        :widget="widget"
        :monitors="monitors"
      />
    </div>
  </div>
</template>
