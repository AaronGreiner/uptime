import { asc, eq, sql } from 'drizzle-orm'
import type { MonitorGroup } from '../../shared/types/group'
import { MONITOR_GROUP_MAX_DEPTH } from '../../shared/utils/group'
import { monitorGroups, monitors } from '../database/schema'
import type { MonitorGroupRow } from '../database/schema'

export function serializeMonitorGroup(row: MonitorGroupRow, notificationGroupIds: number[] = []): MonitorGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    parentId: row.parentId,
    position: row.position,
    notificationMode: row.notificationMode,
    notificationGroupIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listMonitorGroupRows(): MonitorGroupRow[] {
  return useDatabase()
    .select()
    .from(monitorGroups)
    .orderBy(asc(monitorGroups.position), asc(monitorGroups.name), asc(monitorGroups.id))
    .all()
}

export function listMonitorGroups(): MonitorGroup[] {
  const assignments = loadMonitorGroupNotificationGroupIds()

  return listMonitorGroupRows().map(row => serializeMonitorGroup(row, assignments.get(row.id) ?? []))
}

export function getMonitorGroupRow(id: number): MonitorGroupRow | undefined {
  return useDatabase().select().from(monitorGroups).where(eq(monitorGroups.id, id)).get()
}

/** Places a new group last among its siblings. */
export function nextGroupPosition(parentId: number | null): number {
  const row = useDatabase()
    .select({ max: sql<number | null>`max(${monitorGroups.position})` })
    .from(monitorGroups)
    .where(parentId === null ? sql`${monitorGroups.parentId} is null` : eq(monitorGroups.parentId, parentId))
    .get()

  return (row?.max ?? -1) + 1
}

/**
 * Validates a parent assignment. The tree is small enough to reason about in
 * memory, which keeps this readable compared to a recursive CTE.
 *
 * Rejects a missing parent, a group becoming its own ancestor, and any move that
 * would push the deepest leaf past MONITOR_GROUP_MAX_DEPTH.
 *
 * @param id Group being saved, or null while creating one.
 */
export function assertValidParent(id: number | null, parentId: number | null): void {
  const rows = listMonitorGroupRows()
  const byId = new Map(rows.map(row => [row.id, row]))

  if (parentId !== null && !byId.has(parentId)) {
    throw createError({ statusCode: 400, statusMessage: 'Parent group not found' })
  }

  const ancestors = ancestorChain(byId, parentId)

  if (id !== null && (parentId === id || ancestors.includes(id))) {
    throw createError({ statusCode: 400, statusMessage: 'A group cannot be nested into itself' })
  }

  // The chain already contains the parent itself, so its length is the depth the
  // parent sits at, and zero when the group becomes a root.
  const parentDepth = ancestors.length
  const height = id === null ? 1 : subtreeHeight(rows, id)

  if (parentDepth + height > MONITOR_GROUP_MAX_DEPTH) {
    throw createError({
      statusCode: 400,
      statusMessage: `Groups may not nest deeper than ${MONITOR_GROUP_MAX_DEPTH} levels`
    })
  }
}

/** Ids from the direct parent up to the root, nearest first. */
function ancestorChain(byId: Map<number, MonitorGroupRow>, parentId: number | null): number[] {
  const chain: number[] = []
  const seen = new Set<number>()
  let current = parentId

  while (current !== null && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = byId.get(current)?.parentId ?? null
  }

  return chain
}

/** Number of levels occupied by a group and its descendants, at least one. */
function subtreeHeight(rows: MonitorGroupRow[], id: number): number {
  const children = rows.filter(row => row.parentId === id)

  return children.length ? 1 + Math.max(...children.map(child => subtreeHeight(rows, child.id))) : 1
}

/**
 * Deleting a group must never take monitors with it, so subgroups and monitors
 * move up to the deleted group's parent first.
 */
export function deleteMonitorGroup(row: MonitorGroupRow, updatedAt: number): void {
  const database = useDatabase()

  database.transaction((transaction) => {
    transaction
      .update(monitorGroups)
      .set({ parentId: row.parentId, updatedAt })
      .where(eq(monitorGroups.parentId, row.id))
      .run()

    transaction
      .update(monitors)
      .set({ groupId: row.parentId, updatedAt })
      .where(eq(monitors.groupId, row.id))
      .run()

    transaction.delete(monitorGroups).where(eq(monitorGroups.id, row.id)).run()
  })
}

/**
 * Swaps a group with its neighbouring sibling. Positions are renumbered from the
 * current visible order first, so groups created before this feature — all of
 * them sharing position 0 — reorder predictably.
 */
export function moveMonitorGroup(row: MonitorGroupRow, direction: 'up' | 'down', updatedAt: number): void {
  const siblings = listMonitorGroupRows().filter(entry => entry.parentId === row.parentId)
  const index = siblings.findIndex(entry => entry.id === row.id)
  const targetIndex = direction === 'up' ? index - 1 : index + 1

  if (index === -1 || targetIndex < 0 || targetIndex >= siblings.length) {
    return
  }

  const reordered = [...siblings]

  reordered.splice(targetIndex, 0, ...reordered.splice(index, 1))

  const database = useDatabase()

  database.transaction((transaction) => {
    reordered.forEach((entry, position) => {
      if (entry.position === position) {
        return
      }

      transaction.update(monitorGroups).set({ position, updatedAt }).where(eq(monitorGroups.id, entry.id)).run()
    })
  })
}

/** Guards the `groupId` sent with a monitor payload. */
export function assertGroupExists(groupId: number | null): void {
  if (groupId === null) {
    return
  }

  if (!getMonitorGroupRow(groupId)) {
    throw createError({ statusCode: 400, statusMessage: 'Group not found' })
  }
}
