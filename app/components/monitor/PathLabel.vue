<script setup lang="ts">
import type { Monitor } from '#shared/types/monitor'
import { MONITOR_PATH_SEPARATOR, joinMonitorPath } from '#shared/utils/group'

const props = withDefaults(defineProps<{
  /** A monitor, whose breadcrumb is resolved from the shared group tree. */
  monitor?: Pick<Monitor, 'name' | 'groupId'> | null
  /** Name of a record that carries its own breadcrumb, such as a delivery. */
  name?: string
  /** Group names from the root down, for the same case. */
  path?: string[]
}>(), {
  monitor: null,
  name: undefined,
  path: undefined
})

const { groupSegments, shorten } = useMonitorPath()

const label = computed(() => props.monitor?.name ?? props.name ?? '')

/** The whole path, which the tooltip reports whatever the format shows. */
const segments = computed(() => props.path ?? groupSegments(props.monitor))
const shown = computed(() => shorten(segments.value))
const full = computed(() => joinMonitorPath([...segments.value, label.value]))
</script>

<template>
  <!--
    The groups give way long before the name does: the name is what the reader
    scans for, the path only tells two of the same name apart. Shrinking both by
    the same factor would cut the name first in every narrow cell.
  -->
  <span
    class="flex items-baseline gap-1 min-w-0"
    :title="full"
  >
    <span
      v-if="shown.length"
      class="min-w-0 shrink-[999] font-normal text-dimmed truncate-target"
    >{{ joinMonitorPath(shown) }}</span>
    <span
      v-if="shown.length"
      class="shrink-0 font-normal text-dimmed"
    >{{ MONITOR_PATH_SEPARATOR }}</span>
    <span class="min-w-0 truncate-target">{{ label }}</span>
  </span>
</template>
