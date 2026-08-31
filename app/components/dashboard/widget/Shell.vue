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
  /** Lists keep their row spacing but need less vertical card padding. */
  list?: boolean
  empty?: boolean
  emptyLabel?: string
  emptyIcon?: string
}>(), {
  to: undefined,
  caption: undefined,
  dense: false,
  list: false,
  empty: false,
  emptyLabel: undefined,
  emptyIcon: 'i-lucide-inbox'
})

const bodyClass = computed(() => [
  'flex-1 flex flex-col min-h-0 overflow-hidden',
  props.dense || props.list ? 'gap-2' : 'gap-3',
  props.list
    ? (props.dense ? 'px-3 py-1.5 sm:px-4 sm:py-1.5' : 'px-4 py-3 sm:px-5 sm:py-3')
    : (props.dense ? 'p-3 sm:p-4' : 'p-4 sm:p-5')
].join(' '))
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
    <div class="flex shrink-0 items-baseline justify-between gap-2">
      <component
        :is="to ? NuxtLink : 'p'"
        :to="to"
        class="min-w-0 flex-1 text-sm @[24rem]:text-base font-medium text-highlighted truncate-target"
        :class="to ? 'hover:text-primary transition-colors' : ''"
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
      <div class="flex min-w-0 max-w-[55%] shrink-0 items-center gap-2">
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
      class="flex-1 grid place-items-center min-h-0"
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
      class="flex-1 min-h-0 overflow-hidden"
    >
      <slot />
    </div>
  </UCard>
</template>
