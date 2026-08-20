<script setup lang="ts">
import { MorphIcon } from 'morphicons/vue'
import type { MorphOptions, SpringPreset } from 'morphicons/vue'

const props = withDefaults(defineProps<{
  name: MorphIconName
  label?: string
  spring?: SpringPreset | MorphOptions
}>(), { spring: 'snappy' })

const { reducedMotion } = useMorphMotion()
const icon = computed(() => MORPH_ICONS[props.name])
</script>

<template>
  <MorphIcon
    :icon="icon"
    :spring="spring"
    :reduced-motion="reducedMotion"
    :label="label"
  />
</template>
