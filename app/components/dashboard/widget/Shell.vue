<script setup lang="ts">
import { NuxtLink } from '#components'

const props = withDefaults(defineProps<{
  /** Plain wording; the `title` slot replaces it where a breadcrumb is drawn. */
  title: string
  /** Makes the title a link, for a widget that stands for one monitor. */
  to?: string
  /** Small caption on the right of the header, such as the time range. */
  caption?: string
  /** Very short cells tighten the padding instead of dropping content. */
  dense?: boolean
  /**
   * Where the title and the caption go. `above` is the ordinary stacked header;
   * `overlay` lays them over the content, for a fixed block that is taller than
   * what a header above it leaves of a short cell; `none` drops them, which is
   * what a widget whose label the dashboard has switched off asks for.
   */
  header?: 'above' | 'overlay' | 'none'
  /** Lists keep their row spacing but need less vertical card padding. */
  list?: boolean
  empty?: boolean
  emptyLabel?: string
  emptyIcon?: string
}>(), {
  to: undefined,
  caption: undefined,
  dense: false,
  header: 'above',
  list: false,
  empty: false,
  emptyLabel: undefined,
  emptyIcon: 'i-lucide-inbox'
})

const overlay = computed(() => props.header === 'overlay')

/**
 * Overlaid, the header and the content share one grid cell instead of being
 * stacked in a column — which is what keeps the card's own padding aligning
 * both of them, with no offsets to keep in step with it.
 */
const bodyClass = computed(() => [
  'flex-1 min-h-0 overflow-hidden',
  overlay.value ? 'grid' : 'flex flex-col',
  overlay.value ? '' : (props.dense || props.list ? 'gap-2' : 'gap-3'),
  props.list
    ? (props.dense ? 'px-3 py-1.5 sm:px-4 sm:py-1.5' : 'px-4 py-3 sm:px-5 sm:py-3')
    : (props.dense ? 'p-3 sm:p-4' : 'p-4 sm:p-5')
].join(' '))

const cellClass = 'col-start-1 row-start-1'

/**
 * Over the content the two lines stack in the top corner on a plate of the card's
 * own surface, letting what is underneath show through: it covers a reading
 * rather than replacing it. The negative margins put the text itself where a
 * stacked header would have started, so the plate bleeds into the padding.
 */
const headerClass = computed(() => overlay.value
  ? `${cellClass} z-10 self-start justify-self-start flex min-w-0 max-w-full flex-col gap-0.5 -ms-1.5 -mt-1 rounded-md bg-default/80 px-1.5 py-1 backdrop-blur-[2px]`
  : 'flex shrink-0 items-baseline justify-between gap-2')

const titleClass = computed(() => overlay.value ? 'min-w-0' : 'min-w-0 flex-1')

const metaClass = computed(() => overlay.value
  ? 'flex min-w-0 items-center gap-2'
  : 'flex min-w-0 max-w-[55%] shrink-0 items-center gap-2')

const contentClass = computed(() => overlay.value
  ? `${cellClass} min-h-0 min-w-0 overflow-hidden`
  : 'flex-1 min-h-0 overflow-hidden')
</script>

<template>
  <UCard
    variant="outline"
    class="h-full @container"
    :ui="{
      root: 'flex flex-col overflow-hidden',
      body: bodyClass
    }"
  >
    <div
      v-if="header !== 'none'"
      :class="headerClass"
    >
      <component
        :is="to ? NuxtLink : 'p'"
        :to="to"
        class="text-sm @[24rem]:text-base font-medium text-highlighted truncate-target"
        :class="[titleClass, to ? 'hover:text-primary transition-colors' : '']"
      >
        <slot name="title">
          {{ title }}
        </slot>
      </component>
      <!--
        Controls sit ahead of the caption rather than in the corner the edit mode
        keeps its own buttons in. A cell too narrow for both hides them: the
        caption says what the widget shows, the control is a convenience the
        detail page and the settings offer as well.
      -->
      <div :class="metaClass">
        <div class="hidden @[24rem]:flex">
          <slot name="actions" />
        </div>
        <p
          v-if="caption"
          class="truncate text-[0.6875rem] @[24rem]:text-xs text-dimmed"
          :title="caption"
        >
          <slot name="caption">
            {{ caption }}
          </slot>
        </p>
      </div>
    </div>

    <div
      v-if="empty"
      class="grid place-items-center min-h-0"
      :class="overlay ? cellClass : 'flex-1'"
    >
      <p class="flex items-center gap-2 text-sm text-dimmed">
        <UIcon
          :name="emptyIcon"
          class="size-4 shrink-0"
        />
        {{ emptyLabel }}
      </p>
    </div>

    <!-- Lists measure this body and render only complete rows. -->
    <div
      v-else
      :class="contentClass"
    >
      <slot />
    </div>
  </UCard>
</template>
