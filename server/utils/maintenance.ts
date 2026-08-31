import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import type { MaintenanceStatus, MaintenanceWindow } from '../../shared/types/maintenance'
import { MAINTENANCE_DEFAULT_TIME_ZONE, maintenanceChain, resolveMaintenance } from '../../shared/utils/maintenance'
import type { MaintenanceWindowInput } from '../../shared/utils/validation'
import { maintenanceWindows, monitorGroups, monitors } from '../database/schema'
import type { MaintenanceWindowRow, MonitorGroupRow, MonitorRow } from '../database/schema'
import { nowInSeconds } from '../services/scheduler'

export function serializeMaintenanceWindow(row: MaintenanceWindowRow): MaintenanceWindow {
  return {
    id: row.id,
    note: row.note,
    monitorId: row.monitorId,
    monitorGroupId: row.monitorGroupId,
    weekdays: row.weekdays,
    startMinute: row.startMinute,
    durationMinutes: row.durationMinutes,
    enabled: row.enabled
  }
}

/** Zone every window is read in. One instance, one wall clock. */
export function maintenanceTimeZone(): string {
  return getSetting<string>(SETTING_KEYS.maintenanceTimeZone, MAINTENANCE_DEFAULT_TIME_ZONE)
}

/**
 * Every window, earliest in the day first. The settings page reads this one
 * list; the monitor and group payloads carry their own slice of it.
 */
export function listMaintenanceWindowRows(): MaintenanceWindowRow[] {
  return useDatabase()
    .select()
    .from(maintenanceWindows)
    .orderBy(asc(maintenanceWindows.startMinute), asc(maintenanceWindows.id))
    .all()
}

export function listMaintenanceWindows(): MaintenanceWindow[] {
  return listMaintenanceWindowRows().map(serializeMaintenanceWindow)
}

export function getMaintenanceWindowRow(id: number): MaintenanceWindowRow | undefined {
  return useDatabase().select().from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).get()
}

/** Collects rows into a map keyed by whichever owner column is set. */
function windowsBy(rows: MaintenanceWindowRow[], key: (row: MaintenanceWindowRow) => number | null) {
  const byOwner = new Map<number, MaintenanceWindow[]>()

  for (const row of rows) {
    const owner = key(row)

    if (owner === null) {
      continue
    }

    const list = byOwner.get(owner)
    const window = serializeMaintenanceWindow(row)

    if (list) {
      list.push(window)
    } else {
      byOwner.set(owner, [window])
    }
  }

  return byOwner
}

export function loadMaintenanceWindows(): {
  byMonitor: Map<number, MaintenanceWindow[]>
  byGroup: Map<number, MaintenanceWindow[]>
} {
  const rows = listMaintenanceWindowRows()

  return {
    byMonitor: windowsBy(rows, row => row.monitorId),
    byGroup: windowsBy(rows, row => row.monitorGroupId)
  }
}

export function monitorMaintenanceWindows(monitorId: number): MaintenanceWindow[] {
  return useDatabase()
    .select()
    .from(maintenanceWindows)
    .where(eq(maintenanceWindows.monitorId, monitorId))
    .orderBy(asc(maintenanceWindows.startMinute), asc(maintenanceWindows.id))
    .all()
    .map(serializeMaintenanceWindow)
}

export function groupMaintenanceWindows(monitorGroupId: number): MaintenanceWindow[] {
  return useDatabase()
    .select()
    .from(maintenanceWindows)
    .where(eq(maintenanceWindows.monitorGroupId, monitorGroupId))
    .orderBy(asc(maintenanceWindows.startMinute), asc(maintenanceWindows.id))
    .all()
    .map(serializeMaintenanceWindow)
}

/** What a monitor and its ancestors contribute, nearest source first. */
type MaintenanceOwner = Pick<MonitorRow, 'groupId' | 'maintenanceStartedAt' | 'maintenanceUntil'> & { id: number }

/**
 * Resolves maintenance for many monitors over a single snapshot of the windows
 * and the group tree — the same trade-off `monitorGroupPathResolver` makes, for
 * the same reason: a list of monitors would otherwise read both tables per row.
 *
 * The walk has no early exit. Windows add up, so every ancestor is visited
 * whatever the ones below it said.
 */
export function maintenanceResolver(): (monitor: MaintenanceOwner, now?: number) => MaintenanceStatus {
  const { byMonitor, byGroup } = loadMaintenanceWindows()
  const timeZone = maintenanceTimeZone()
  const groupsById = new Map<number, MonitorGroupRow>(listMonitorGroupRows().map(row => [row.id, row]))

  const nodeOf = (groupId: number) => {
    const group = groupsById.get(groupId)

    return group === undefined
      ? undefined
      : {
          parentId: group.parentId,
          maintenanceStartedAt: group.maintenanceStartedAt,
          maintenanceUntil: group.maintenanceUntil,
          maintenanceWindows: byGroup.get(group.id) ?? []
        }
  }

  return (monitor, now = nowInSeconds()) => resolveMaintenance(
    maintenanceChain({
      groupId: monitor.groupId,
      maintenanceStartedAt: monitor.maintenanceStartedAt,
      maintenanceUntil: monitor.maintenanceUntil,
      maintenanceWindows: byMonitor.get(monitor.id) ?? []
    }, nodeOf),
    now,
    timeZone
  )
}

/** The same answer for a single monitor, used by the scheduler per check. */
export function resolveMonitorMaintenance(monitor: MaintenanceOwner, now = nowInSeconds()): MaintenanceStatus {
  return maintenanceResolver()(monitor, now)
}

/**
 * Rejects a window whose target does not exist. The zod schema has already made
 * sure exactly one of the two is named.
 */
export function assertMaintenanceTargetExists(input: MaintenanceWindowInput): void {
  if (input.monitorId !== null && !getMonitorRow(input.monitorId)) {
    throw createError({ statusCode: 400, statusMessage: 'Monitor not found' })
  }

  if (input.monitorGroupId !== null && !getMonitorGroupRow(input.monitorGroupId)) {
    throw createError({ statusCode: 400, statusMessage: 'Group not found' })
  }
}

/**
 * Clears manual switches that have run out.
 *
 * Nothing depends on this — `isOverrideActive` compares against the clock, so an
 * expired switch is already inactive everywhere. It only keeps the rows honest,
 * so the forms and the API do not report a maintenance that ended last week.
 */
export function pruneExpiredMaintenanceOverrides(now = nowInSeconds()): void {
  const database = useDatabase()

  for (const table of [monitors, monitorGroups]) {
    database
      .update(table)
      .set({ maintenanceStartedAt: null, maintenanceUntil: null, updatedAt: now })
      .where(and(isNotNull(table.maintenanceUntil), lte(table.maintenanceUntil, now)))
      .run()
  }
}
