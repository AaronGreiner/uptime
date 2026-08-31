<script setup lang="ts">
import type { TooltipProps } from '@nuxt/ui'

defineProps<{
  reference?: TooltipProps['reference']
}>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <!-- One tooltip per chart, anchored to the current reading. The portal escapes
       clipped cards and uses viewport coordinates even in a scaled preview. -->
  <UTooltip
    v-model:open="open"
    :reference="reference"
    :delay-duration="0"
    disable-hoverable-content
    :content="{ side: 'top', positionStrategy: 'fixed', updatePositionStrategy: 'always', hideWhenDetached: true }"
    :ui="{ content: 'block h-auto max-w-[min(20rem,calc(100vw-1rem))] whitespace-normal break-words pointer-events-none z-50' }"
  >
    <slot />
    <template #content>
      <slot name="content" />
    </template>
  </UTooltip>
</template>
