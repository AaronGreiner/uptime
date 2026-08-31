<script setup lang="ts" generic="T">
import type { WidgetHeight } from '#shared/types/dashboard'
import { widgetListFetchLimit } from '#shared/utils/grid'

const props = defineProps<{
  items: T[]
  itemKey: (item: T) => string | number
  height: WidgetHeight
}>()

const list = useTemplateRef<HTMLElement>('list')
const capacity = ref<number | null>(null)
const visible = computed(() => props.items.slice(0, capacity.value ?? widgetListFetchLimit(props.height)))

onMounted(() => {
  const element = list.value

  if (!element) {
    return
  }

  // Read the CSS row size, including container-query changes. Layout pixels
  // stay correct in the scaled settings preview; viewport rectangles do not.
  const observer = new ResizeObserver(() => {
    const rowHeight = Number.parseFloat(getComputedStyle(element).gridAutoRows)

    if (rowHeight > 0) {
      capacity.value = Math.max(0, Math.floor(element.clientHeight / rowHeight))
    }
  })

  observer.observe(element)
  onScopeDispose(() => observer.disconnect())
})
</script>

<template>
  <ul
    ref="list"
    class="grid h-full auto-rows-[29px] content-start overflow-hidden"
  >
    <li
      v-for="item in visible"
      :key="itemKey(item)"
      class="min-w-0 overflow-hidden py-1 border-b border-default/50 last:border-0"
    >
      <slot :item="item" />
    </li>
  </ul>
</template>
