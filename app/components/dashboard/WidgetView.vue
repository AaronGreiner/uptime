<script setup lang="ts">
import type { DashboardWidget, WidgetHeight, WidgetWidth } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { WIDGET_GAP_PX, WIDGET_HEIGHT_CLASS, WIDGET_HEIGHT_ROWS, WIDGET_ROW_HEIGHT_PX, WIDGET_WIDTH_CLASS } from '#shared/utils/grid'
import { REPEAT_WIDGET_TYPE, stepWidgetHeight, stepWidgetWidth, widgetChildren } from '#shared/utils/widget'

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

/**
 * A repeat block has no cell of its own: it is drawn as a band of whole grid
 * rows, and how many of them it needs follows from its children rather than
 * from a size token. So the band is measured and the row span written out.
 *
 * Only the layout being arranged ever gets here — a dashboard being read
 * expands the block into ordinary cells, where none of this is needed.
 */
const isBand = computed(() => props.widget.type === REPEAT_WIDGET_TYPE)

/**
 * Enough rows for the tallest child plus the band's own frame, which is right
 * often enough that the first paint does not jump. The observer below corrects
 * it against the real height a frame later.
 */
const bandRows = ref(Math.max(
  ...widgetChildren(props.widget.config).map(child => WIDGET_HEIGHT_ROWS[child.height]),
  1
) + 1)

const root = useTemplateRef<HTMLElement>('root')
const bandContent = useTemplateRef<HTMLElement>('bandContent')

onMounted(() => {
  const observer = new ResizeObserver(() => {
    const content = bandContent.value

    if (!content) {
      return
    }

    // Read off the grid rather than off the constants: the row height and the
    // gaps change with the breakpoint, and the grid is the one that knows.
    const grid = root.value?.parentElement
    const style = grid ? getComputedStyle(grid) : null
    const gap = Number.parseFloat(style?.rowGap ?? '') || WIDGET_GAP_PX
    const row = Number.parseFloat(style?.gridAutoRows ?? '') || WIDGET_ROW_HEIGHT_PX

    bandRows.value = Math.max(1, Math.ceil((content.offsetHeight + gap) / (row + gap)))
  })

  watch(bandContent, (content) => {
    observer.disconnect()

    if (content) {
      observer.observe(content)
    }
  }, { immediate: true })

  onScopeDispose(() => observer.disconnect())
})

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
    ref="root"
    class="relative h-full min-w-0 group/widget @container rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :class="isBand
      ? WIDGET_WIDTH_CLASS.full
      : [WIDGET_WIDTH_CLASS[widget.width], WIDGET_HEIGHT_CLASS[widget.height]]"
    :style="isBand ? { gridRow: `span ${bandRows}` } : undefined"
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
        v-if="!isBand"
        icon="i-lucide-chevron-left"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!narrowerWidth"
        :aria-label="stepLabel('narrower', 'width', narrowerWidth)"
        @click="resizeWidth(narrowerWidth)"
      />
      <UButton
        v-if="!isBand"
        icon="i-lucide-chevron-right"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!widerWidth"
        :aria-label="stepLabel('wider', 'width', widerWidth)"
        @click="resizeWidth(widerWidth)"
      />
      <UButton
        v-if="!isBand"
        icon="i-lucide-chevron-up"
        size="xs"
        color="neutral"
        variant="subtle"
        :disabled="!shorterHeight"
        :aria-label="stepLabel('shorter', 'height', shorterHeight)"
        @click="resizeHeight(shorterHeight)"
      />
      <UButton
        v-if="!isBand"
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

    <!--
      The band is measured, so it has to keep its natural height while the cell
      around it is being told how tall to be.
    -->
    <div
      v-if="isBand"
      ref="bandContent"
      class="min-w-0"
    >
      <DashboardWidgetBody
        :widget="widget"
        :monitors="monitors"
      />
    </div>
    <DashboardWidgetBody
      v-else
      :widget="widget"
      :monitors="monitors"
    />
  </div>
</template>
