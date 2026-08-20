<script setup lang="ts">
import { MorphIcon } from 'morphicons/vue'

const props = defineProps<{
  name: MorphIconName
  label?: string
}>()

const { reducedMotion } = useMorphMotion()
const icon = computed(() => MORPH_ICONS[props.name])
</script>

<template>
  <MorphIcon
    :icon="icon"
    spring="snappy"
    :reduced-motion="reducedMotion"
    :label="label"
  />
</template>
