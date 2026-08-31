import type { DropdownMenuItem } from '@nuxt/ui'
import type { MonitorGroup } from '#shared/types/group'
import type { MaintenanceNode, MaintenanceStatus, MaintenanceWindow } from '#shared/types/maintenance'
import {
  MAINTENANCE_DEFAULT_TIME_ZONE,
  MAINTENANCE_MANUAL_DURATIONS,
  isMaintenanceStale,
  isOverrideActive,
  maintenanceChain,
  nextWindowStart
} from '#shared/utils/maintenance'

/**
 * Zone the windows are read in, instance wide.
 *
 * A `useState` in front of the endpoint rather than a fetch per caller: the
 * value is read once per window a form draws, and two `useAsyncData` entries
 * for the same setting would drift apart the moment an admin changed it — the
 * same reason `useMonitorPathPreference` is built this way.
 */
export function useMaintenanceTimeZone() {
  return useState<string>('maintenance-time-zone', () => MAINTENANCE_DEFAULT_TIME_ZONE)
}

/** Shared list of every window, for the settings page that manages them. */
export function useMaintenanceWindows() {
  return useAsyncData<MaintenanceWindow[]>(
    'maintenance-windows',
    () => $fetch('/api/maintenance/windows'),
    { default: () => [] }
  )
}

/** Loads the zone into that state. Called once, from the dashboard layout. */
export async function useMaintenanceSettings() {
  const timeZone = useMaintenanceTimeZone()

  const { data, refresh } = await useAsyncData(
    'maintenance-settings',
    () => $fetch<{ timeZone: string }>('/api/maintenance/settings')
  )

  watchEffect(() => {
    if (data.value) {
      timeZone.value = data.value.timeZone
    }
  })

  return { timeZone, refresh }
}

/**
 * Resolves maintenance in the browser, over the group cache and the shared
 * clock, with the very function the scheduler uses.
 *
 * Nothing here answers "is this monitor in maintenance": the server resolves
 * that into every payload, and the list reconciles once a minute, which is the
 * resolution a schedule written in whole minutes has anyway.
 *
 * What it answers is the one question the payload cannot carry — when the next
 * window over a monitor opens, which the maintenance widget lists — and it
 * answers it by running the rule rather than by describing it. `timeZone` rides
 * along because everything that draws a window has to name the clock it is
 * written in.
 */
export function useMaintenanceResolver() {
  const { data: groups } = useMonitorGroups()
  const timeZone = useMaintenanceTimeZone()
  const now = useNow()

  const nodeOf = computed(() => {
    const byId = new Map<number, MonitorGroup>(groups.value.map(group => [group.id, group]))

    return (groupId: number): MaintenanceNode | undefined => byId.get(groupId)
  })

  /**
   * When the next window over this monitor opens, or null within the week.
   *
   * Its own windows and the inherited ones are flattened into one list, because
   * they add up: which node a window hangs on changes nothing about when the
   * monitor is in maintenance.
   */
  function nextStart(source: { groupId: number | null, maintenanceWindows: MaintenanceWindow[] }) {
    const windows = maintenanceChain({ ...emptySource(), ...source }, nodeOf.value)
      .flatMap(entry => entry.maintenanceWindows)

    return nextWindowStart(windows, Math.floor(now.value / 1000), timeZone.value)
  }

  return { nextStart, timeZone }
}

function emptySource() {
  return { maintenanceStartedAt: null, maintenanceUntil: null, maintenanceWindows: [] }
}

/** Wording for a running maintenance, shared by the badge and the notice. */
export function useMaintenanceLabel() {
  const { t } = useI18n()
  const { formatTime, formatDuration } = useFormatters()
  const now = useNow()

  const seconds = computed(() => Math.floor(now.value / 1000))

  /** Null when nothing is running, which is what hides the affordance. */
  function label(status: MaintenanceStatus | null | undefined): string | null {
    if (!status?.active) {
      return null
    }

    if (status.until !== null) {
      return t('maintenance.activeUntil', { time: formatTime(status.until) })
    }

    // How long it has been running rather than the clock time it started at: a
    // switch flipped on Friday would otherwise read as an innocent `16:18` on
    // Monday. The same wording the stale warning uses, one line down.
    if (status.since !== null) {
      return t('maintenance.activeSince', { duration: formatDuration(Math.max(0, seconds.value - status.since)) })
    }

    return t('maintenance.activeOpenEnded')
  }

  /** An open ended switch nobody flipped back, which is the one failure mode. */
  function stale(status: MaintenanceStatus | null | undefined): boolean {
    return status ? isMaintenanceStale(status, seconds.value) : false
  }

  function runningFor(status: MaintenanceStatus): string {
    return formatDuration(Math.max(0, seconds.value - (status.since ?? seconds.value)))
  }

  return { label, stale, runningFor }
}

/**
 * The manual switch as a dropdown entry, so the monitor list, the detail page
 * and the group list all offer the same durations in the same order.
 */
export function useMaintenanceMenu() {
  const { t } = useI18n()
  const { formatDuration } = useFormatters()

  function menuItem(
    source: { maintenanceStartedAt: number | null, maintenanceUntil: number | null },
    onStart: (durationSeconds: number | null) => unknown,
    onEnd: () => unknown
  ): DropdownMenuItem {
    const now = Math.floor(Date.now() / 1000)

    // Only the record's own switch, not the resolved status: ending a window it
    // inherits from a parent is not something this row can do, and offering it
    // would be a button that quietly does nothing.
    if (isOverrideActive(source, now)) {
      return {
        label: t('maintenance.manual.end'),
        icon: 'i-lucide-wrench',
        onSelect: () => onEnd()
      }
    }

    return {
      label: t('maintenance.manual.start'),
      icon: 'i-lucide-wrench',
      children: MAINTENANCE_MANUAL_DURATIONS.map(duration => ({
        label: duration === null
          ? t('maintenance.manual.openEnded')
          : t('maintenance.manual.forDuration', { duration: formatDuration(duration) }),
        onSelect: () => onStart(duration)
      }))
    }
  }

  return { menuItem }
}
