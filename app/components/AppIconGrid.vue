<script setup lang="ts">
import { customIconCollection, customIconName } from '#shared/utils/icon'

const props = defineProps<{
  icons: string[]
  label: string
  /** Used icons get a small scroll area; the full catalog fills the dialog. */
  maxRows?: number
}>()
const model = defineModel<string | null>({ required: true })
const { t } = useI18n()
const frame = useTemplateRef<HTMLElement>('frame')
const columns = ref(6)

// A 36 px button plus a 4 px gutter. Labels live in tooltips and the preview.
const CELL_HEIGHT = 36
const GAP = 4
const PITCH = CELL_HEIGHT + GAP
const height = computed(() => props.maxRows
  ? `${Math.min(props.maxRows, Math.ceil(props.icons.length / columns.value)) * PITCH - GAP}px`
  : '100%')

watch(frame, (element, _, onCleanup) => {
  if (!element) return

  const observer = new ResizeObserver(() => {
    columns.value = Math.max(3, Math.floor(element.clientWidth / PITCH))
  })

  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

function iconLabel(icon: string): string {
  return t('iconPicker.namedIcon', {
    name: customIconName(icon),
    collection: t(`iconPicker.collection.${customIconCollection(icon)}`)
  })
}
</script>

<template>
  <div
    ref="frame"
    :style="{ height }"
  >
    <UScrollArea
      :key="columns"
      :items="icons"
      :virtualize="{ lanes: columns, estimateSize: CELL_HEIGHT, gap: GAP, overscan: columns * 2, skipMeasurement: true }"
      class="h-full rounded-lg focus-visible:outline-primary"
      role="group"
      :aria-label="label"
      tabindex="0"
    >
      <template #default="{ item }">
        <UButton
          :key="item"
          type="button"
          :color="model === item ? 'primary' : 'neutral'"
          :variant="model === item ? 'soft' : 'ghost'"
          class="w-full h-9 justify-center p-1"
          :aria-label="iconLabel(item)"
          :title="iconLabel(item)"
          :aria-pressed="model === item"
          @click="model = item"
        >
          <UIcon
            :name="item"
            class="size-5 shrink-0"
          />
        </UButton>
      </template>
    </UScrollArea>
  </div>
</template>
