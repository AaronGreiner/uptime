<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { Time } from '@internationalized/date'
import type { MaintenanceWindow } from '#shared/types/maintenance'
import { joinMonitorPath, monitorGroupIcon } from '#shared/utils/group'
import {
  MAINTENANCE_WINDOW_BOUNDS,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_KEYS,
  WEEKDAY_MASK_ALL,
  WEEKDAY_MASK_WEEKDAYS,
  hasWeekday,
  toggleWeekday
} from '#shared/utils/maintenance'
import { maintenanceWindowInputSchema } from '#shared/utils/validation'
import type { MaintenanceWindowInput } from '#shared/utils/validation'

const props = defineProps<{
  /** Omit to create a new window. */
  window?: MaintenanceWindow | null
}>()

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { formatTimeOfDay } = useFormatters()
const { flatTree, monitors } = useMonitorTree()
const { fullMonitorPath } = useMonitorPath()
const { timeZone } = useMaintenanceResolver()

const WEEKEND_MASK = (1 << 0) | (1 << 6)

/**
 * One picker for both kinds of target rather than a kind switch and then a
 * list. Which of the two columns ends up carrying the id is a detail of the
 * table; the question the admin is answering is "what does this cover".
 */
const GROUP_PREFIX = 'g'
const MONITOR_PREFIX = 'm'

function createState(): MaintenanceWindowInput {
  return {
    note: props.window?.note ?? null,
    monitorId: props.window?.monitorId ?? null,
    monitorGroupId: props.window?.monitorGroupId ?? null,
    // Every day at three in the morning: the schedule this feature exists for.
    weekdays: props.window?.weekdays ?? WEEKDAY_MASK_ALL,
    startMinute: props.window?.startMinute ?? 3 * 60,
    durationMinutes: props.window?.durationMinutes ?? 30,
    enabled: props.window?.enabled ?? true
  }
}

const state = ref<MaintenanceWindowInput>(createState())
const submitting = ref(false)

// The modal stays mounted, so the form is reset whenever it opens.
watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState()
  }
})

const isEdit = computed(() => Boolean(props.window))

/** Groups first: a window on a node is the common case, a single monitor the exception. */
const targetItems = computed(() => [
  ...flatTree.value.map(node => ({
    label: joinMonitorPath(node.path),
    value: `${GROUP_PREFIX}:${node.id}`,
    icon: monitorGroupIcon(node)
  })),
  ...monitors.value.map(monitor => ({
    label: fullMonitorPath(monitor),
    value: `${MONITOR_PREFIX}:${monitor.id}`,
    icon: monitorIcon(monitor)
  }))
])

const selectedTarget = computed({
  get: () => {
    if (state.value.monitorGroupId !== null) {
      return `${GROUP_PREFIX}:${state.value.monitorGroupId}`
    }

    return state.value.monitorId === null ? undefined : `${MONITOR_PREFIX}:${state.value.monitorId}`
  },
  set: (value: string | undefined) => {
    const [kind, id] = value?.split(':') ?? []

    state.value.monitorGroupId = kind === GROUP_PREFIX ? Number(id) : null
    state.value.monitorId = kind === MONITOR_PREFIX ? Number(id) : null
  }
})

/**
 * The stored value is a minute of the day; the field speaks `Time`. Bridged
 * here rather than stored as a `Time`, because a window is a rule about the
 * wall clock and a minute is the smallest thing that says so.
 */
const startTime = computed({
  get: () => new Time(Math.floor(state.value.startMinute / 60), state.value.startMinute % 60),
  set: (value: Time | null | undefined) => {
    if (value) {
      state.value.startMinute = value.hour * 60 + value.minute
    }
  }
})

const presets = computed(() => [
  { label: t('maintenance.everyDay'), mask: WEEKDAY_MASK_ALL },
  { label: t('maintenance.workdays'), mask: WEEKDAY_MASK_WEEKDAYS },
  { label: t('maintenance.weekend'), mask: WEEKEND_MASK }
])

function weekdayLabel(weekday: number): string {
  return t(`maintenance.weekday.${WEEKDAY_KEYS[weekday]}`)
}

function weekdayTitle(weekday: number): string {
  return t(`maintenance.weekdayLong.${WEEKDAY_KEYS[weekday]}`)
}

/**
 * The span in words, which is the only place the form says what it will
 * actually do. A window reaching past midnight says so rather than showing an
 * end time that reads as earlier than its start.
 */
const spanLabel = computed(() => {
  const end = state.value.startMinute + state.value.durationMinutes
  const params = { start: formatTimeOfDay(state.value.startMinute), end: formatTimeOfDay(end) }

  return t(end >= 1440 ? 'maintenance.spansNextDay' : 'maintenance.spans', params)
})

async function onSubmit(event: FormSubmitEvent<MaintenanceWindowInput>) {
  submitting.value = true

  try {
    await $fetch(
      isEdit.value ? `/api/maintenance/windows/${props.window!.id}` : '/api/maintenance/windows',
      { method: isEdit.value ? 'PATCH' : 'POST', body: event.data }
    )

    toast.add({
      title: t(isEdit.value ? 'maintenance.windowUpdated' : 'maintenance.windowCreated'),
      color: 'success',
      icon: 'i-lucide-check'
    })

    emit('saved')
    open.value = false
  } catch (error) {
    toast.add({
      title: t('common.error'),
      description: resolveErrorMessage(error),
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t(isEdit ? 'maintenance.editWindow' : 'maintenance.addWindow')"
    :description="$t('maintenance.description')"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        id="maintenance-window-form"
        :schema="maintenanceWindowInputSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="$t('maintenance.target')"
          name="monitorId"
          :description="$t('maintenance.targetHint')"
          required
        >
          <USelectMenu
            v-model="selectedTarget"
            :items="targetItems"
            value-key="value"
            class="w-full"
            :placeholder="$t('maintenance.targetPlaceholder')"
          />
        </UFormField>

        <UFormField
          :label="$t('maintenance.weekdays')"
          name="weekdays"
        >
          <div class="flex flex-wrap items-center gap-1">
            <UButton
              v-for="weekday in WEEKDAY_DISPLAY_ORDER"
              :key="weekday"
              size="sm"
              :color="hasWeekday(state.weekdays, weekday) ? 'primary' : 'neutral'"
              :variant="hasWeekday(state.weekdays, weekday) ? 'subtle' : 'ghost'"
              :label="weekdayLabel(weekday)"
              :title="weekdayTitle(weekday)"
              :aria-pressed="hasWeekday(state.weekdays, weekday)"
              @click="state.weekdays = toggleWeekday(state.weekdays, weekday)"
            />

            <span class="mx-1 h-4 w-px bg-border" />

            <UButton
              v-for="preset in presets"
              :key="preset.label"
              size="sm"
              color="neutral"
              variant="link"
              :label="preset.label"
              @click="state.weekdays = preset.mask"
            />
          </div>
        </UFormField>

        <div class="flex flex-wrap items-end gap-3">
          <UFormField
            :label="$t('maintenance.start')"
            name="startMinute"
          >
            <!-- Segmented rather than the browser's own time control: it is
                 styled like the rest of the form and it follows the app locale,
                 which `UApp` already binds to the interface language. -->
            <UInputTime
              v-model="startTime"
              granularity="minute"
              class="w-32"
            />
          </UFormField>

          <UFormField
            :label="$t('maintenance.duration')"
            name="durationMinutes"
          >
            <UInputNumber
              v-model="state.durationMinutes"
              class="w-32"
              :min="MAINTENANCE_WINDOW_BOUNDS.duration.min"
              :max="MAINTENANCE_WINDOW_BOUNDS.duration.max"
            />
          </UFormField>

          <p class="text-sm text-muted pb-2">
            {{ spanLabel }}
          </p>
        </div>

        <p class="text-xs text-dimmed">
          {{ $t('maintenance.timeZoneHint', { zone: timeZone }) }}
        </p>

        <UFormField
          :label="$t('maintenance.note')"
          name="note"
          :description="$t('maintenance.noteHint')"
          :hint="$t('common.optional')"
        >
          <UInput
            :model-value="state.note ?? ''"
            class="w-full"
            :placeholder="$t('maintenance.notePlaceholder')"
            @update:model-value="state.note = String($event) || null"
          />
        </UFormField>

        <UFormField
          :label="$t('maintenance.enabled')"
          name="enabled"
          :description="$t('maintenance.enabledHint')"
        >
          <USwitch v-model="state.enabled" />
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
          form="maintenance-window-form"
          :loading="submitting"
          :label="$t(isEdit ? 'common.save' : 'common.create')"
        />
      </div>
    </template>
  </UModal>
</template>
