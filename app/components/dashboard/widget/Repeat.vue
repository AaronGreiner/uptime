<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { joinMonitorPath } from '#shared/utils/group'
import { WIDGET_GRID_CLASS, WIDGET_HEIGHT_CLASS, WIDGET_WIDTH_CLASS } from '#shared/utils/grid'
import { repeatChildWidget, widgetChildren } from '#shared/utils/widget'

/**
 * A repeat block as its author sees it: one band, drawn with the first monitor
 * of the scope, plus what it stands for.
 *
 * The reader never gets here. On a dashboard the grid expands the block into
 * ordinary cells, and this component is what the block collapses to while the
 * layout is being arranged and in the settings preview — the two places where
 * the block itself, rather than its result, is the thing being looked at.
 */
const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { byId } = useMonitorTree()
const { fullMonitorPath } = useMonitorPath()
const { scoped } = useWidgetScope(() => props.widget)

const children = computed(() => widgetChildren(props.widget.config))
const covered = computed(() => sortMonitors(scoped.value, props.widget.config.sort))

/**
 * The band is drawn for one monitor, and only its id decides which. Reading the
 * id rather than the monitor keeps the children from being rebuilt every time a
 * check result patches the shared list.
 */
const sampleId = computed(() => covered.value[0]?.id ?? null)
const sample = computed(() => props.monitors.find(monitor => monitor.id === sampleId.value) ?? null)

const sampleChildren = computed(() => sampleId.value === null
  ? []
  : children.value.map(child => repeatChildWidget(props.widget, child, sampleId.value!)))

/** What the block covers: its own title, else the group, else everything. */
const label = computed(() => {
  const title = props.widget.config.title

  if (title) {
    return title
  }

  const groupId = props.widget.config.groupId
  const node = groupId ? byId.value.get(groupId) : null

  return node ? joinMonitorPath(node.path) : t('monitor.allMonitors')
})

/** The whole path: the band names which monitor it happens to be drawn with. */
const sampleLabel = computed(() => fullMonitorPath(sample.value))

/**
 * Both halves counted through their own plural, because German and English
 * both inflect them and one rule cannot serve two numbers.
 */
const summary = computed(() => t('widget.repeat.summary', {
  monitors: t('monitor.count', covered.value.length),
  widgets: t('widget.repeat.widgetCount', children.value.length)
}))
</script>

<template>
  <div class="min-w-0 flex flex-col gap-2 rounded-lg border border-dashed border-default bg-elevated/30 p-3">
    <div class="flex min-w-0 items-center gap-2">
      <UIcon
        name="i-lucide-repeat"
        class="size-4 shrink-0 text-primary"
      />
      <p class="min-w-0 truncate text-sm font-medium text-highlighted">
        {{ label }}
      </p>
      <UBadge
        color="neutral"
        variant="subtle"
        size="sm"
        class="shrink-0"
      >
        {{ summary }}
      </UBadge>
      <!--
        On the same line as the label rather than under the band: the block is
        quantised to whole grid rows, so every pixel of its own chrome can cost
        a row the children have no use for.
      -->
      <p
        v-if="sample"
        class="hidden min-w-0 shrink-[999] truncate text-xs text-dimmed @[32rem]:block"
      >
        {{ $t('widget.repeat.sample', { name: sampleLabel }) }}
      </p>
    </div>

    <p
      v-if="!children.length || !sample"
      class="flex items-center gap-2 py-6 text-sm text-dimmed"
    >
      <UIcon
        name="i-lucide-inbox"
        class="size-4 shrink-0"
      />
      {{ $t(children.length ? 'widget.list.noMonitors' : 'widget.repeat.noChildren') }}
    </p>

    <template v-else>
      <!--
        The same columns, gaps and row height as the dashboard grid, so a child
        sits where it will sit once the block is expanded. The band's own
        padding insets it by a few pixels, which is what marks it as one thing.
      -->
      <div :class="[WIDGET_GRID_CLASS, 'content-start']">
        <div
          v-for="(child, index) in sampleChildren"
          :key="index"
          class="h-full min-w-0 @container"
          :class="[WIDGET_WIDTH_CLASS[child.width], WIDGET_HEIGHT_CLASS[child.height]]"
        >
          <DashboardWidgetBody
            :widget="child"
            :monitors="monitors"
          />
        </div>
      </div>
    </template>
  </div>
</template>
