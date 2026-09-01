<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { WIDGET_ROW_HEIGHT_PX, widgetPixelHeight, widgetPixelWidth } from '#shared/utils/grid'
import { REPEAT_WIDGET_TYPE, widgetNeedsMonitor } from '#shared/utils/widget'

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

// The dialog around this preview is the settings themselves, so a widget's own
// controls stay out of it: the reader is configuring here, not reading.
provideWidgetEditing(() => true)

const frame = useTemplateRef<HTMLElement>('frame')
const content = useTemplateRef<HTMLElement>('content')
const available = ref(GRID_WIDTH)

/**
 * A repeat block has no height token: it is as tall as its band turns out to
 * be. So the band is drawn at its natural height and measured, where every
 * other widget is drawn at the height its token buys.
 */
const isBand = computed(() => props.widget.type === REPEAT_WIDGET_TYPE)
const bandHeight = ref(WIDGET_ROW_HEIGHT_PX)

/**
 * Rendering the widget without its monitor would show the "no longer exists"
 * state, which is a different thing from not having picked one yet.
 */
const awaitingMonitor = computed(() => widgetNeedsMonitor(props.widget.type) && !props.widget.monitorId)

const width = computed(() => widgetPixelWidth(props.widget.width, GRID_WIDTH))
const height = computed(() => isBand.value ? bandHeight.value : widgetPixelHeight(props.widget.height))
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

  // Measured off the untransformed box, which is what a ResizeObserver reports
  // whatever the scale around it is.
  const band = new ResizeObserver(([entry]) => {
    bandHeight.value = Math.max(WIDGET_ROW_HEIGHT_PX, entry?.contentRect.height ?? 0)
  })

  watch(content, (node) => {
    band.disconnect()

    if (node) {
      band.observe(node)
    }
  }, { immediate: true })

  onScopeDispose(() => {
    observer.disconnect()
    band.disconnect()
  })
})
</script>

<template>
  <div
    ref="frame"
    class="w-full overflow-hidden"
    :style="{ height: `${height * scale}px` }"
  >
    <div
      ref="content"
      class="origin-top-left"
      :style="{
        width: `${width}px`,
        height: isBand ? undefined : `${height}px`,
        transform: `scale(${scale})`
      }"
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
