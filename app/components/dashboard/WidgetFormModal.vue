<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { DashboardWidget, WidgetHeight, WidgetWidth } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { joinMonitorPath, monitorGroupIcon } from '#shared/utils/group'
import { LATENCY_CHART_STYLES } from '#shared/utils/monitor'
import { STATS_RANGES } from '#shared/utils/stats'
import {
  WIDGET_DEFINITIONS,
  WIDGET_SLA_TARGETS,
  WIDGET_SORTS,
  WIDGET_TYPES,
  clampWidgetSize,
  widgetConfigDefaults,
  widgetConfigForType,
  widgetHasField,
  widgetHeightOptions,
  widgetWidthOptions
} from '#shared/utils/widget'
import { widgetInputSchema } from '#shared/utils/validation'
import type { WidgetInput } from '#shared/utils/validation'

const props = defineProps<{
  dashboardId: number
  /** Omit to add a new widget. */
  widget?: DashboardWidget | null
  monitors: MonitorWithState[]
}>()

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { formatUptime } = useFormatters()
const { flatTree } = useMonitorTree()

/**
 * Every setting the registry knows, whichever type is selected. The submitted
 * config is reduced to the fields of the chosen type, so switching back and
 * forth in the dialog does not lose what the other branch had.
 */
function createState(widget?: DashboardWidget | null): WidgetInput {
  const type = widget?.type ?? 'monitor'
  const size = clampWidgetSize(type, widget?.width, widget?.height)
  const defaults = widgetConfigDefaults(type)

  return {
    type,
    monitorId: widget?.monitorId ?? null,
    config: {
      title: widget?.config.title ?? '',
      range: widget?.config.range ?? defaults.range,
      style: widget?.config.style ?? defaults.style,
      level: widget?.config.level ?? defaults.level,
      monitorIds: widget?.config.monitorIds ?? defaults.monitorIds,
      groupId: widget?.config.groupId ?? defaults.groupId,
      target: widget?.config.target ?? defaults.target,
      sort: widget?.config.sort ?? defaults.sort
    },
    ...size
  }
}

const state = ref<WidgetInput>(createState(props.widget))
const submitting = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState(props.widget)
  }
})

/**
 * A type change carries the size along to whatever the new type allows, and
 * adopts the settings the new type prefers for the ones the old type never had
 * a field for.
 */
watch([() => state.value.type, state], ([type, current], [previous, old]) => {
  // Opening another widget replaces the form with its saved configuration.
  // Only a type change within that form should adopt the new type's defaults.
  if (current !== old) {
    return
  }

  const size = clampWidgetSize(type, state.value.width, state.value.height)
  const defaults = widgetConfigDefaults(type)

  state.value.width = size.width
  state.value.height = size.height

  for (const field of ['range', 'style'] as const) {
    if (!widgetHasField(previous, field)) {
      Object.assign(state.value.config, { [field]: defaults[field] })
    }
  }
})

const isEdit = computed(() => Boolean(props.widget))

const typeItems = computed(() => WIDGET_TYPES.map(type => ({
  label: t(`widget.type.${type}`),
  value: type,
  icon: WIDGET_DEFINITIONS[type].icon,
  description: t(`widget.typeDescription.${type}`)
})))

const { filter: filterMonitorItems } = useMonitorPicker(() => props.monitors)

// One term per picker: they never stand open at the same time, but a shared
// one would still leak the last search into the other's first frame.
const monitorSearch = ref('')
const monitorListSearch = ref('')

const monitorResults = computed(() => filterMonitorItems(monitorSearch.value))
const monitorListResults = computed(() => filterMonitorItems(monitorListSearch.value))

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

const groupItems = computed(() => [
  { label: t('widget.scope.noGroup'), value: null as number | null, icon: 'i-lucide-globe' },
  ...flatTree.value.map(node => ({
    label: joinMonitorPath(node.path),
    value: node.id as number | null,
    icon: monitorGroupIcon(node)
  }))
])

const widthItems = computed(() => widgetWidthOptions(state.value.type).map(width => ({
  label: t(`widget.width.${width}`),
  value: width as WidgetWidth
})))

const heightItems = computed(() => widgetHeightOptions(state.value.type).map(height => ({
  label: t(`widget.height.${height}`),
  value: height as WidgetHeight
})))

/** USelectMenu works with `undefined` for "nothing selected", the API with `null`. */
const selectedMonitorId = computed({
  get: () => state.value.monitorId ?? undefined,
  set: (value: number | undefined) => {
    state.value.monitorId = value ?? null
  }
})

function hasField(field: Parameters<typeof widgetHasField>[1]): boolean {
  return widgetHasField(state.value.type, field)
}

/** A group scope follows the tree, so the hand-picked list is hidden while one is set. */
const usesMonitorList = computed(() => hasField('scope') && !state.value.config.groupId)

/**
 * The preview is the real widget with the real data, assembled from the form as
 * it stands. Sample data would hide exactly what the reader opened the dialog to
 * check: whether this monitor, at this size, in this range, says anything.
 */
const previewWidget = computed<DashboardWidget>(() => ({
  id: props.widget?.id ?? 0,
  dashboardId: props.dashboardId,
  type: state.value.type,
  monitorId: state.value.monitorId,
  config: widgetConfigForType(state.value.type, state.value.config),
  position: props.widget?.position ?? 0,
  width: state.value.width ?? WIDGET_DEFINITIONS[state.value.type].defaultWidth,
  height: state.value.height ?? WIDGET_DEFINITIONS[state.value.type].defaultHeight,
  createdAt: 0,
  updatedAt: 0
}))

async function onSubmit(event: FormSubmitEvent<WidgetInput>) {
  submitting.value = true

  try {
    await $fetch(
      isEdit.value
        ? `/api/dashboards/${props.dashboardId}/widgets/${props.widget!.id}`
        : `/api/dashboards/${props.dashboardId}/widgets`,
      {
        method: isEdit.value ? 'PATCH' : 'POST',
        body: event.data
      }
    )

    emit('saved')
    open.value = false
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t(isEdit ? 'widget.edit' : 'widget.add')"
    :ui="{ content: 'max-w-6xl' }"
  >
    <template #body>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <UForm
          id="widget-form"
          :schema="widgetInputSchema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            :label="$t('widget.fields.type')"
            name="type"
            required
          >
            <USelectMenu
              v-model="state.type"
              :items="typeItems"
              value-key="value"
              :search-input="{ placeholder: $t('common.search') }"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="hasField('monitor')"
            :label="$t('widget.fields.monitor')"
            name="monitorId"
            required
          >
            <USelectMenu
              v-model="selectedMonitorId"
              v-model:search-term="monitorSearch"
              :items="monitorResults"
              value-key="value"
              ignore-filter
              class="w-full"
              :placeholder="$t('widget.fields.monitor')"
            >
              <template #item-label="{ item }">
                <AppHighlight
                  :text="item.label"
                  :query="monitorSearch"
                />
              </template>
              <template #item-description="{ item }">
                <AppHighlight
                  :text="item.description"
                  :query="monitorSearch"
                />
              </template>
            </USelectMenu>
          </UFormField>

          <template v-if="hasField('scope')">
            <UFormField
              :label="$t('widget.fields.group')"
              name="config.groupId"
              :hint="$t('common.optional')"
              :description="$t('widget.scope.groupHint')"
            >
              <USelectMenu
                v-model="state.config.groupId"
                :items="groupItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField
              v-if="usesMonitorList"
              :label="$t('widget.fields.monitors')"
              name="config.monitorIds"
              :hint="$t('common.optional')"
              :description="$t('widget.scope.monitorsHint')"
            >
              <USelectMenu
                v-model="state.config.monitorIds"
                v-model:search-term="monitorListSearch"
                multiple
                :items="monitorListResults"
                value-key="value"
                ignore-filter
                class="w-full"
                :placeholder="$t('monitor.allMonitors')"
              >
                <template #item-label="{ item }">
                  <AppHighlight
                    :text="item.label"
                    :query="monitorListSearch"
                  />
                </template>
                <template #item-description="{ item }">
                  <AppHighlight
                    :text="item.description"
                    :query="monitorListSearch"
                  />
                </template>
              </USelectMenu>
            </UFormField>
          </template>

          <UFormField
            :label="$t('widget.fields.title')"
            name="config.title"
            :hint="$t('common.optional')"
          >
            <UInput
              v-model="state.config.title"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              v-if="hasField('range')"
              :label="$t('widget.fields.range')"
              name="config.range"
            >
              <USelectMenu
                v-model="state.config.range"
                :items="rangeItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              v-if="hasField('target')"
              :label="$t('widget.fields.target')"
              name="config.target"
            >
              <USelectMenu
                v-model="state.config.target"
                :items="targetItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              v-if="hasField('style')"
              :label="$t('widget.fields.style')"
              name="config.style"
            >
              <USelectMenu
                v-model="state.config.style"
                :items="styleItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              v-if="hasField('sort')"
              :label="$t('widget.fields.sort')"
              name="config.sort"
            >
              <USelectMenu
                v-model="state.config.sort"
                :items="sortItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              v-if="hasField('level')"
              :label="$t('widget.fields.level')"
              name="config.level"
            >
              <USelectMenu
                v-model="state.config.level"
                :items="levelItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="$t('widget.fields.width')"
              name="width"
            >
              <USelectMenu
                v-model="state.width"
                :items="widthItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="$t('widget.fields.height')"
              name="height"
            >
              <USelectMenu
                v-model="state.height"
                :items="heightItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>
          </div>
        </UForm>

        <div class="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
          <p class="text-sm font-medium text-highlighted">
            {{ $t('widget.preview.title') }}
          </p>
          <div class="rounded-lg border border-dashed border-default bg-elevated/30 p-3">
            <DashboardWidgetPreview
              :widget="previewWidget"
              :monitors="monitors"
            />
          </div>
          <p class="text-xs text-dimmed">
            {{ $t('widget.preview.hint') }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="$t('common.cancel')"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="widget-form"
          :loading="submitting"
          :label="$t(isEdit ? 'common.save' : 'common.add')"
        />
      </div>
    </template>
  </UModal>
</template>
