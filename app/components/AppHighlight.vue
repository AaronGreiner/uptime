<script setup lang="ts">
import { highlightSegments } from '#shared/utils/search'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  text: string
  /** The current search, or nothing where the text is not a search result. */
  query?: string
}>(), {
  query: ''
})

const segments = computed(() => highlightSegments(props.text, props.query))
</script>

<template>
  <!--
    Rendered as nodes rather than through `v-html`: a monitor name, a group name
    and a URL are all user input. Every tag sits tight against its text on
    purpose — a line break inside one of them condenses to a space and pulls the
    pieces of a word apart.
  -->
  <span
    v-for="(segment, index) in segments"
    :key="index"
  ><mark
    v-if="segment.match"
    class="rounded-[2px] bg-primary/25 text-inherit"
  >{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></span>
</template>
