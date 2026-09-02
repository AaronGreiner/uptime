<script setup lang="ts">
import type { WidgetConfig, WidgetHeight, WidgetType, WidgetWidth } from '#shared/types/dashboard'
import type { StatsRange } from '#shared/types/stats'
import { LATENCY_CHART_STYLES } from '#shared/utils/monitor'
import { STATS_RANGES } from '#shared/utils/stats'
import {
  WIDGET_SLA_TARGETS,
  WIDGET_SORTS,
  widgetHasField,
  widgetHeightOptions,
  widgetWidthOptions
} from '#shared/utils/widget'

/**
 * The settings a widget keeps wherever it is drawn, rendered from the registry.
 *
 * Split out of the settings dialog because a repeat block edits its children
 * with the very same fields: what a child cannot have is its own monitor and
 * its own scope, since the block hands it both, and those two stay in the
 * dialog around this.
 */
const props = withDefaults(defineProps<{
  type: WidgetType
  /** Path the enclosing form knows these fields by, for the error messages. */
  path?: string
}>(), {
  path: ''
})

/**
 * Three models rather than one object, so a child of a repeat block can be
 * bound straight from the loop that lists them: the config is only ever
 * mutated in place, the two sizes are written back.
 */
const config = defineModel<WidgetConfig>('config', { required: true })
const width = defineModel<WidgetWidth | undefined>('width')
const height = defineModel<WidgetHeight | undefined>('height')

const { t } = useI18n()
const { formatUptime } = useFormatters()

function name(field: string): string {
  return props.path ? `${props.path}.${field}` : field
}

function hasField(field: Parameters<typeof widgetHasField>[1]): boolean {
  return widgetHasField(props.type, field)
}

const rangeItems = computed(() => STATS_RANGES.map(range => ({
  label: t(`range.${range}`),
  value: range as StatsRange
})))

const levelItems = computed(() => ([1, 2, 3] as const).map(level => ({
  label: t(`widget.level.${level}`),
  value: level
})))

const sortItems = computed(() => WIDGET_SORTS.map(sort => ({
  label: t(`widget.sort.${sort}`),
  value: sort
})))

const targetItems = computed(() => WIDGET_SLA_TARGETS.map(target => ({
  label: formatUptime(target),
  value: target as number
})))

/**
 * `inherit` first and by default: a dashboard is read by people who have their
 * own setting, and a widget only overrides it where its author meant to.
 */
const styleItems = computed(() => [
  { label: t('widget.style.inherit'), value: 'inherit' as const },
  ...LATENCY_CHART_STYLES.map(style => ({ label: t(`monitor.latencyStyle.${style}`), value: style }))
])

const widthItems = computed(() => widgetWidthOptions(props.type).map(option => ({
  label: t(`widget.width.${option}`),
  value: option as WidgetWidth
})))

const heightItems = computed(() => widgetHeightOptions(props.type).map(option => ({
  label: t(`widget.height.${option}`),
  value: option as WidgetHeight
})))

/**
 * A type with one allowed size is not offering a choice. The repeat block is
 * the case: it has no cell, its band is as wide and as tall as its children.
 */
const showSize = computed(() => widthItems.value.length > 1 || heightItems.value.length > 1)
</script>

<template>
  <div class="space-y-4">
    <UFormField
      :label="$t('widget.fields.title')"
      :name="name('config.title')"
      :hint="$t('common.optional')"
    >
      <UInput
        v-model="config.title"
        class="w-full"
      />
    </UFormField>

    <UFormField
      v-if="hasField('label')"
      :name="name('config.showLabel')"
      :description="$t('widget.hints.showLabel')"
    >
      <USwitch
        v-model="config.showLabel"
        :label="$t('widget.fields.showLabel')"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        v-if="hasField('range')"
        :label="$t('widget.fields.range')"
        :name="name('config.range')"
      >
        <USelectMenu
          v-model="config.range"
          :items="rangeItems"
          value-key="value"
          :search-input="false"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="hasField('target')"
        :label="$t('widget.fields.target')"
        :name="name('config.target')"
      >
        <USelectMenu
          v-model="config.target"
          :items="targetItems"
          value-key="value"
          :search-input="false"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="hasField('style')"
        :label="$t('widget.fields.style')"
        :name="name('config.style')"
      >
        <USelectMenu
          v-model="config.style"
          :items="styleItems"
          value-key="value"
          :search-input="false"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="hasField('sort')"
        :label="$t('widget.fields.sort')"
        :name="name('config.sort')"
      >
        <USelectMenu
          v-model="config.sort"
          :items="sortItems"
          value-key="value"
          :search-input="false"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="hasField('level')"
        :label="$t('widget.fields.level')"
        :name="name('config.level')"
      >
        <USelectMenu
          v-model="config.level"
          :items="levelItems"
          value-key="value"
          :search-input="false"
          class="w-full"
        />
      </UFormField>

      <template v-if="showSize">
        <UFormField
          :label="$t('widget.fields.width')"
          :name="name('width')"
        >
          <USelectMenu
            v-model="width"
            :items="widthItems"
            value-key="value"
            :search-input="false"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="$t('widget.fields.height')"
          :name="name('height')"
        >
          <USelectMenu
            v-model="height"
            :items="heightItems"
            value-key="value"
            :search-input="false"
            class="w-full"
          />
        </UFormField>
      </template>
    </div>
  </div>
</template>
