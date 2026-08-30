<script setup lang="ts">
import { NuxtLink } from '#components'

withDefaults(defineProps<{
  /** Plain wording; the `title` slot replaces it where a breadcrumb is drawn. */
  title: string
  /** Makes the title a link, for a widget that stands for one monitor. */
  to?: string
  /** Small caption on the right of the header, such as the time range. */
  caption?: string
  /** Very short cells tighten the padding instead of dropping content. */
  dense?: boolean
  empty?: boolean
  emptyLabel?: string
  emptyIcon?: string
  /** Drops the list treatment for content that fills the body itself. */
  plain?: boolean
}>(), {
  to: undefined,
  caption: undefined,
  dense: false,
  empty: false,
  emptyLabel: undefined,
  emptyIcon: 'i-lucide-inbox',
  plain: false
})
</script>

<template>
  <UCard
    variant="outline"
    class="h-full @container"
    :ui="{
      root: 'flex flex-col overflow-hidden',
      body: dense
        ? 'p-3 sm:p-4 flex-1 flex flex-col gap-2 min-h-0 overflow-hidden'
        : 'p-4 sm:p-5 flex-1 flex flex-col gap-3 min-h-0 overflow-hidden'
    }"
  >
    <div class="flex items-baseline justify-between gap-3">
      <component
        :is="to ? NuxtLink : 'p'"
        :to="to"
        class="min-w-0 text-sm @[24rem]:text-base font-medium text-highlighted truncate-target"
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
      <div class="flex items-center gap-2 shrink-0">
        <div class="hidden @[24rem]:flex">
          <slot name="actions" />
        </div>
        <p
          v-if="caption"
          class="text-[0.6875rem] @[24rem]:text-xs text-dimmed"
        >
          {{ caption }}
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
          class="size-4"
        />
        {{ emptyLabel }}
      </p>
    </div>

    <!--
      The cell height is fixed, so a list that outgrows it is clipped rather than
      scrolled; see MonitorCard. The bottom padding is exactly the height of the
      fade, so a list that fits is faded over its padding and looks untouched,
      while a clipped one ends in a gradient instead of in half a row.
    -->
    <div
      v-else
      class="flex-1 min-h-0 overflow-hidden"
      :class="plain ? '' : 'pb-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-0.75rem),transparent)]'"
    >
      <slot />
    </div>
  </UCard>
</template>
