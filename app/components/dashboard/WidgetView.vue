<script setup lang="ts">
import type { DashboardWidget, WidgetHeight, WidgetWidth } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { WIDGET_HEIGHT_CLASS, WIDGET_WIDTH_CLASS } from '#shared/utils/grid'
import { stepWidgetHeight, stepWidgetWidth } from '#shared/utils/widget'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
  editing: boolean
}>()

const emit = defineEmits<{
  edit: []
  duplicate: []
  remove: []
  resize: [size: { width: WidgetWidth, height: WidgetHeight }]
  move: [direction: -1 | 1]
}>()

const { t } = useI18n()

const narrowerWidth = computed(() => stepWidgetWidth(props.widget.type, props.widget.width, -1))
const widerWidth = computed(() => stepWidgetWidth(props.widget.type, props.widget.width, 1))
const shorterHeight = computed(() => stepWidgetHeight(props.widget.type, props.widget.height, -1))
const tallerHeight = computed(() => stepWidgetHeight(props.widget.type, props.widget.height, 1))

function resizeWidth(width: WidgetWidth | null) {
  if (width) {
    emit('resize', { width, height: props.widget.height })
  }
}

function resizeHeight(height: WidgetHeight | null) {
  if (height) {
    emit('resize', { width: props.widget.width, height })
  }
}

function stepLabel(
  action: 'wider' | 'narrower' | 'taller' | 'shorter',
  dimension: 'width' | 'height',
  result: WidgetWidth | WidgetHeight | null
): string {
  return result ? `${t(`widget.resize.${action}`)}: ${t(`widget.${dimension}.${result}`)}` : t(`widget.resize.${action}`)
}

function onKeydown(event: KeyboardEvent) {
  if (!props.editing || event.target !== event.currentTarget || event.ctrlKey || event.metaKey) {
    return
  }

  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
    emit('move', event.key === 'ArrowLeft' ? -1 : 1)
    return
  }

  const action = {
    ArrowLeft: () => resizeWidth(narrowerWidth.value),
    ArrowRight: () => resizeWidth(widerWidth.value),
    ArrowUp: () => resizeHeight(shorterHeight.value),
    ArrowDown: () => resizeHeight(tallerHeight.value)
  }[event.key]

  if (action) {
    event.preventDefault()
    action()
  }
}
</script>

<template>
  <div
    class="relative h-full min-w-0 group/widget @container rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :class="[WIDGET_WIDTH_CLASS[widget.width], WIDGET_HEIGHT_CLASS[widget.height]]"
    :tabindex="editing ? 0 : undefined"
    :aria-label="editing ? (widget.config.title || $t(`widget.type.${widget.type}`)) : undefined"
    @keydown="onKeydown"
  >
    <div
      v-if="editing"
      class="absolute right-1.5 top-1.5 z-10 flex flex-wrap justify-end gap-1 max-w-[calc(100%-0.75rem)] rounded-md opacity-0 pointer-events-none group-hover/widget:opacity-100 group-hover/widget:pointer-events-auto group-focus-within/widget:opacity-100 group-focus-within/widget:pointer-events-auto transition-opacity"
    >
      <UButton
        data-widget-drag
        icon="i-lucide-grip-vertical"
        size="xs"
        color="neutral"
        variant="subtle"
        class="cursor-grab active:cursor-grabbing"
        :aria-label="$t('widget.reorder')"
      />
      <UButton
        icon="i-lucide-chevron-left"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!narrowerWidth"
        :aria-label="stepLabel('narrower', 'width', narrowerWidth)"
        @click="resizeWidth(narrowerWidth)"
      />
      <UButton
        icon="i-lucide-chevron-right"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!widerWidth"
        :aria-label="stepLabel('wider', 'width', widerWidth)"
        @click="resizeWidth(widerWidth)"
      />
      <UButton
        icon="i-lucide-chevron-up"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!shorterHeight"
        :aria-label="stepLabel('shorter', 'height', shorterHeight)"
        @click="resizeHeight(shorterHeight)"
      />
      <UButton
        icon="i-lucide-chevron-down"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!tallerHeight"
        :aria-label="stepLabel('taller', 'height', tallerHeight)"
        @click="resizeHeight(tallerHeight)"
      />
      <UButton
        icon="i-lucide-copy-plus"
        size="xs"
        color="neutral"
        variant="subtle"
        :aria-label="$t('widget.duplicate')"
        @click="emit('duplicate')"
      />
      <UButton
        icon="i-lucide-settings-2"
        size="xs"
        color="neutral"
        variant="subtle"
        :aria-label="$t('widget.edit')"
        @click="emit('edit')"
      />
      <UButton
        icon="i-lucide-trash-2"
        size="xs"
        color="error"
        variant="subtle"
        :aria-label="$t('widget.remove')"
        @click="emit('remove')"
      />
    </div>

    <DashboardWidgetBody
      :widget="widget"
      :monitors="monitors"
    />
  </div>
</template>
