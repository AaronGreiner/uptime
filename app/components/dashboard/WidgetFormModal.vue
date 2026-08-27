<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { DashboardWidget, WidgetType } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { MONITOR_HEARTBEAT_COUNT_BOUNDS, clampHeartbeatCount } from '#shared/utils/monitor'
import { STATS_RANGES } from '#shared/utils/stats'
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

const WIDGET_TYPES: WidgetType[] = ['monitor', 'uptime-summary', 'latency-chart', 'status-overview', 'heading']

function createState(widget?: DashboardWidget | null): WidgetInput {
  return {
    type: widget?.type ?? 'monitor',
    monitorId: widget?.monitorId ?? null,
    config: {
      title: widget?.config.title ?? '',
      range: widget?.config.range ?? '24h',
      heartbeatCount: clampHeartbeatCount(widget?.config.heartbeatCount),
      level: widget?.config.level ?? 2
    }
  }
}

const state = ref<WidgetInput>(createState(props.widget))
const submitting = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState(props.widget)
  }
})

const isEdit = computed(() => Boolean(props.widget))

const typeItems = computed(() => WIDGET_TYPES.map(type => ({
  label: t(`widget.type.${type}`),
  value: type,
  description: t(`widget.typeDescription.${type}`)
})))

const monitorItems = computed(() => props.monitors.map(monitor => ({
  label: monitor.name,
  value: monitor.id,
  description: monitorTarget(monitor)
})))

const rangeItems = computed(() => STATS_RANGES.map(range => ({
  label: t(`range.${range}`),
  value: range as StatsRange
})))

const levelItems = computed(() => ([1, 2, 3] as const).map(level => ({
  label: t(`widget.level.${level}`),
  value: level
})))

/** USelectMenu works with `undefined` for "nothing selected", the API with `null`. */
const selectedMonitorId = computed({
  get: () => state.value.monitorId ?? undefined,
  set: (value: number | undefined) => {
    state.value.monitorId = value ?? null
  }
})

const needsMonitor = computed(() => ['monitor', 'uptime-summary', 'latency-chart'].includes(state.value.type))
const needsRange = computed(() => ['uptime-summary', 'latency-chart'].includes(state.value.type))

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
  >
    <template #body>
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
            :search-input="false"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="needsMonitor"
          :label="$t('widget.fields.monitor')"
          name="monitorId"
          required
        >
          <USelectMenu
            v-model="selectedMonitorId"
            :items="monitorItems"
            value-key="value"
            class="w-full"
            :placeholder="$t('widget.fields.monitor')"
          />
        </UFormField>

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

        <UFormField
          v-if="needsRange"
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
          v-if="state.type === 'monitor'"
          :label="$t('widget.fields.heartbeatCount')"
          name="config.heartbeatCount"
        >
          <UInputNumber
            v-model="state.config.heartbeatCount"
            class="w-full"
            :min="MONITOR_HEARTBEAT_COUNT_BOUNDS.min"
            :max="MONITOR_HEARTBEAT_COUNT_BOUNDS.max"
            :step="5"
          />
        </UFormField>

        <UFormField
          v-if="state.type === 'heading'"
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
      </UForm>
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
