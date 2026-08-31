<script setup lang="ts">
import type { MaintenanceWindow } from '#shared/types/maintenance'
import { joinMonitorPath, monitorGroupIcon } from '#shared/utils/group'
import {
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_KEYS,
  WEEKDAY_MASK_ALL,
  WEEKDAY_MASK_WEEKDAYS,
  hasWeekday,
  isWindowOpen
} from '#shared/utils/maintenance'

defineProps<{
  windows: MaintenanceWindow[]
}>()

const emit = defineEmits<{ edit: [window: MaintenanceWindow], deleted: [] }>()

const { t } = useI18n()
const toast = useToast()
const { formatTimeOfDay } = useFormatters()
const { isAdmin } = useAdmin()
const { byId, monitorsInSubtree } = useMonitorTree()
const { data: monitors } = useMonitors()
const { fullMonitorPath } = useMonitorPath()
const { timeZone } = useMaintenanceResolver()
const now = useNow()

const confirming = ref<MaintenanceWindow | null>(null)
const removing = ref(false)

const monitorsById = computed(() => new Map(monitors.value.map(monitor => [monitor.id, monitor])))

const WEEKEND_MASK = (1 << 0) | (1 << 6)

/** What the window covers, named the way the rest of the interface names it. */
function target(window: MaintenanceWindow) {
  if (window.monitorGroupId !== null) {
    const node = byId.value.get(window.monitorGroupId)

    return {
      label: node ? joinMonitorPath(node.path) : t('maintenance.unknownTarget'),
      icon: monitorGroupIcon(node),
      // A node covers its whole subtree, so the count is what tells the reader
      // how far this one window reaches — which is the thing a central list
      // cannot show by position the way the monitor form once did.
      covers: node ? monitorsInSubtree(node.id).length : 0,
      isGroup: true
    }
  }

  const monitor = window.monitorId === null ? undefined : monitorsById.value.get(window.monitorId)

  return {
    label: monitor ? fullMonitorPath(monitor) : t('maintenance.unknownTarget'),
    icon: monitor ? monitorIcon(monitor) : 'i-lucide-circle-help',
    covers: 1,
    isGroup: false
  }
}

/**
 * The rhythm in the shortest wording that is still exact: the three common
 * masks get a name, everything else is spelled out day by day.
 */
function rhythm(window: MaintenanceWindow): string {
  if (window.weekdays === WEEKDAY_MASK_ALL) {
    return t('maintenance.everyDay')
  }

  if (window.weekdays === WEEKDAY_MASK_WEEKDAYS) {
    return t('maintenance.workdays')
  }

  if (window.weekdays === WEEKEND_MASK) {
    return t('maintenance.weekend')
  }

  return WEEKDAY_DISPLAY_ORDER
    .filter(weekday => hasWeekday(window.weekdays, weekday))
    .map(weekday => t(`maintenance.weekday.${WEEKDAY_KEYS[weekday]}`))
    .join(' ')
}

function span(window: MaintenanceWindow): string {
  const end = window.startMinute + window.durationMinutes

  return t(end >= 1440 ? 'maintenance.spansNextDay' : 'maintenance.spans', {
    start: formatTimeOfDay(window.startMinute),
    end: formatTimeOfDay(end)
  })
}

/** Ticks with the shared clock, so a window lights up as it opens. */
function isOpen(window: MaintenanceWindow): boolean {
  return isWindowOpen(window, Math.floor(now.value / 1000), timeZone.value)
}

async function onDelete() {
  const window = confirming.value

  if (!window) {
    return
  }

  removing.value = true

  try {
    await $fetch(`/api/maintenance/windows/${window.id}`, { method: 'DELETE' })

    confirming.value = null
    emit('deleted')

    toast.add({ title: t('maintenance.windowDeleted'), color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col">
    <p
      v-if="!windows.length"
      class="text-sm text-muted"
    >
      {{ $t('maintenance.noWindows') }}
    </p>

    <div
      v-for="(window, index) in windows"
      :key="window.id"
      class="flex items-start gap-3 py-3"
      :class="[index > 0 ? 'border-t border-default' : '', window.enabled ? '' : 'opacity-60']"
    >
      <div class="min-w-0 flex-1 space-y-1">
        <!-- The rhythm and the time lead, because that is what tells two
             windows on the same branch apart. -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="font-medium text-highlighted">{{ rhythm(window) }}</span>
          <span class="text-highlighted tabular-nums">{{ span(window) }}</span>

          <UBadge
            v-if="isOpen(window)"
            color="info"
            variant="subtle"
            size="sm"
            icon="i-lucide-wrench"
            :label="$t('maintenance.openNow')"
          />
          <UBadge
            v-if="!window.enabled"
            color="neutral"
            variant="subtle"
            size="sm"
            :label="$t('notification.status.disabled')"
          />
        </div>

        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted min-w-0">
          <UIcon
            :name="target(window).icon"
            class="size-4 shrink-0"
          />
          <span class="truncate-target">{{ target(window).label }}</span>
          <span
            v-if="target(window).isGroup"
            class="text-dimmed"
          >
            {{ $t('maintenance.covers', target(window).covers) }}
          </span>
        </div>

        <p
          v-if="window.note"
          class="text-sm text-dimmed"
        >
          {{ window.note }}
        </p>
      </div>

      <div
        v-if="isAdmin"
        class="flex items-center gap-1 shrink-0"
      >
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          :aria-label="$t('common.edit')"
          @click="emit('edit', window)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          :aria-label="$t('common.delete')"
          @click="confirming = window"
        />
      </div>
    </div>

    <ConfirmModal
      :open="confirming !== null"
      :title="$t('maintenance.deleteWindow')"
      :description="$t('maintenance.deleteWindowHint')"
      :confirm-label="$t('common.delete')"
      :loading="removing"
      @update:open="confirming = $event ? confirming : null"
      @confirm="onDelete"
    />
  </div>
</template>
