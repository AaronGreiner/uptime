<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { DashboardWidget, WidgetChild } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { joinMonitorPath, monitorGroupIcon } from '#shared/utils/group'
import {
  REPEAT_MAX_CHILDREN,
  WIDGET_CHILD_TYPES,
  WIDGET_DEFINITIONS,
  WIDGET_TYPES,
  clampWidgetSize,
  widgetConfigDefaults,
  widgetConfigForType,
  widgetHasField
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
      sort: widget?.config.sort ?? defaults.sort,
      children: (widget?.config.children ?? defaults.children).map(child => createChild(child.type, child))
    },
    ...size
  }
}

/**
 * A child carries every setting too, for the same reason the widget above it
 * does: its type can be changed while the dialog is open. What it never carries
 * is a monitor or a scope — the block hands it one per band.
 */
function createChild(type: WidgetChild['type'], child?: WidgetChild): WidgetChild {
  const defaults = widgetConfigDefaults(type)

  return {
    type,
    config: {
      title: child?.config.title ?? '',
      range: child?.config.range ?? defaults.range,
      style: child?.config.style ?? defaults.style,
      level: child?.config.level ?? defaults.level,
      target: child?.config.target ?? defaults.target,
      sort: child?.config.sort ?? defaults.sort
    },
    ...clampWidgetSize(type, child?.width, child?.height)
  }
}

const state = ref<WidgetInput>(createState(props.widget))
const submitting = ref(false)

/** Which child has its settings open. Only ever one, the form is long enough. */
const openChild = ref(-1)

watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState(props.widget)
    openChild.value = state.value.config.children?.length === 1 ? 0 : -1
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

  for (const field of ['range', 'style', 'sort'] as const) {
    if (!widgetHasField(previous, field)) {
      Object.assign(state.value.config, { [field]: defaults[field] })
    }
  }

  // A block with nothing in it is not a widget yet, so it opens with one.
  if (widgetHasField(type, 'children') && !state.value.config.children?.length) {
    state.value.config.children = [createChild('monitor')]
    openChild.value = 0
  }
})

const isEdit = computed(() => Boolean(props.widget))

const typeItems = computed(() => WIDGET_TYPES.map(type => ({
  label: t(`widget.type.${type}`),
  value: type,
  icon: WIDGET_DEFINITIONS[type].icon,
  description: t(`widget.typeDescription.${type}`)
})))

const childTypeItems = computed(() => WIDGET_CHILD_TYPES.map(type => ({
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

const groupItems = computed(() => [
  { label: t('widget.scope.noGroup'), value: null as number | null, icon: 'i-lucide-globe' },
  ...flatTree.value.map(node => ({
    label: joinMonitorPath(node.path),
    value: node.id as number | null,
    icon: monitorGroupIcon(node)
  }))
])

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

const children = computed(() => state.value.config.children ?? [])

function addChild() {
  const list = [...children.value, createChild('monitor')]

  state.value.config.children = list
  openChild.value = list.length - 1
}

function removeChild(index: number) {
  state.value.config.children = children.value.filter((_, position) => position !== index)
  openChild.value = -1
}

function moveChild(index: number, direction: -1 | 1) {
  const target = index + direction
  const list = [...children.value]

  if (target < 0 || target >= list.length) {
    return
  }

  const [child] = list.splice(index, 1)

  list.splice(target, 0, child!)
  state.value.config.children = list
  openChild.value = target
}

/** The same carry-over the widget above gets, one level down. */
function setChildType(index: number, type: WidgetChild['type']) {
  const current = children.value[index]

  if (!current || current.type === type) {
    return
  }

  const defaults = widgetConfigDefaults(type)
  const config = { ...current.config }

  for (const field of ['range', 'style', 'sort'] as const) {
    if (!widgetHasField(current.type, field)) {
      Object.assign(config, { [field]: defaults[field] })
    }
  }

  const list = [...children.value]

  list[index] = { type, config, ...clampWidgetSize(type, current.width, current.height) }
  state.value.config.children = list
}

function childSummary(child: WidgetChild): string {
  return `${t(`widget.width.${child.width}`)} · ${t(`widget.height.${child.height}`)}`
}

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
              :description="$t(hasField('children') ? 'widget.repeat.groupHint' : 'widget.scope.groupHint')"
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

          <DashboardWidgetFields
            v-model:config="state.config"
            v-model:width="state.width"
            v-model:height="state.height"
            :type="state.type"
          />

          <!--
            The band is composed here rather than on the grid: its children are
            never dragged, resized or deleted on their own, they are only ever
            saved as part of the block that holds them.
          -->
          <UFormField
            v-if="hasField('children')"
            :label="$t('widget.fields.children')"
            name="config.children"
            :description="$t('widget.repeat.childrenHint')"
          >
            <div class="space-y-2">
              <div
                v-for="(child, index) in children"
                :key="index"
                class="rounded-md border border-default bg-elevated/30"
              >
                <div class="flex items-center gap-1 p-1.5">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="min-w-0 flex-1 justify-start"
                    :icon="WIDGET_DEFINITIONS[child.type].icon"
                    :aria-expanded="openChild === index"
                    @click="openChild = openChild === index ? -1 : index"
                  >
                    <span class="min-w-0 truncate">
                      {{ $t(`widget.type.${child.type}`) }}
                      <span class="text-dimmed">{{ childSummary(child) }}</span>
                    </span>
                  </UButton>
                  <UButton
                    icon="i-lucide-chevron-up"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="index === 0"
                    :aria-label="$t('widget.repeat.moveChildUp')"
                    @click="moveChild(index, -1)"
                  />
                  <UButton
                    icon="i-lucide-chevron-down"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="index === children.length - 1"
                    :aria-label="$t('widget.repeat.moveChildDown')"
                    @click="moveChild(index, 1)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    size="xs"
                    color="error"
                    variant="ghost"
                    :aria-label="$t('widget.repeat.removeChild')"
                    @click="removeChild(index)"
                  />
                </div>

                <div
                  v-if="openChild === index"
                  class="space-y-4 border-t border-default p-3"
                >
                  <UFormField
                    :label="$t('widget.fields.type')"
                    :name="`config.children.${index}.type`"
                  >
                    <USelectMenu
                      :model-value="child.type"
                      :items="childTypeItems"
                      value-key="value"
                      :search-input="{ placeholder: $t('common.search') }"
                      class="w-full"
                      @update:model-value="setChildType(index, $event)"
                    />
                  </UFormField>

                  <DashboardWidgetFields
                    v-model:config="child.config"
                    v-model:width="child.width"
                    v-model:height="child.height"
                    :type="child.type"
                    :path="`config.children.${index}`"
                  />
                </div>
              </div>

              <UButton
                icon="i-lucide-plus"
                size="xs"
                color="neutral"
                variant="subtle"
                :label="$t('widget.repeat.addChild')"
                :disabled="children.length >= REPEAT_MAX_CHILDREN"
                @click="addChild"
              />
            </div>
          </UFormField>
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
            {{ $t(hasField('children') ? 'widget.repeat.previewHint' : 'widget.preview.hint') }}
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
