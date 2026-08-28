import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { NotificationAssignment } from '../../shared/types/monitor'
import type { NotificationChannel, NotificationDelivery, NotificationGroup } from '../../shared/types/notification'
import { normalizeTeamsNotificationFormat, resolveAssignedGroupIds } from '../../shared/utils/notification'
import {
  monitorGroupNotificationGroups,
  monitorNotificationGroups,
  monitors,
  notificationChannels,
  notificationDeliveries,
  notificationGroupChannels,
  notificationGroups
} from '../database/schema'
import type { NotificationChannelRow, NotificationGroupRow } from '../database/schema'
import { getNotificationProvider } from '../services/notifications/registry'

export function serializeNotificationGroup(row: NotificationGroupRow, channelIds: number[]): NotificationGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    notifyDown: row.notifyDown,
    notifyUp: row.notifyUp,
    notifyCertificateExpiring: row.notifyCertificateExpiring,
    isDefault: row.isDefault,
    position: row.position,
    channelIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listNotificationGroupRows(): NotificationGroupRow[] {
  return useDatabase()
    .select()
    .from(notificationGroups)
    .orderBy(asc(notificationGroups.position), asc(notificationGroups.name), asc(notificationGroups.id))
    .all()
}

/** Collects the second column of a link table into a map keyed by the first. */
function collect<T>(rows: T[], key: (row: T) => number, value: (row: T) => number): Map<number, number[]> {
  const byKey = new Map<number, number[]>()

  for (const row of rows) {
    const existing = byKey.get(key(row))

    if (existing) {
      existing.push(value(row))
    } else {
      byKey.set(key(row), [value(row)])
    }
  }

  return byKey
}

/** Channel ids per group, read in one pass instead of once per group. */
export function loadGroupChannelIds(): Map<number, number[]> {
  const rows = useDatabase()
    .select()
    .from(notificationGroupChannels)
    .orderBy(asc(notificationGroupChannels.groupId), asc(notificationGroupChannels.channelId))
    .all()

  return collect(rows, row => row.groupId, row => row.channelId)
}

/** Assignments per monitor, for a list that would otherwise query per row. */
export function loadMonitorNotificationGroupIds(): Map<number, number[]> {
  const rows = useDatabase()
    .select()
    .from(monitorNotificationGroups)
    .orderBy(asc(monitorNotificationGroups.monitorId), asc(monitorNotificationGroups.groupId))
    .all()

  return collect(rows, row => row.monitorId, row => row.groupId)
}

export function loadMonitorGroupNotificationGroupIds(): Map<number, number[]> {
  const rows = useDatabase()
    .select()
    .from(monitorGroupNotificationGroups)
    .orderBy(asc(monitorGroupNotificationGroups.monitorGroupId), asc(monitorGroupNotificationGroups.groupId))
    .all()

  return collect(rows, row => row.monitorGroupId, row => row.groupId)
}

/** Places a new row last in the list it is shown in. */
export function nextChannelPosition(): number {
  const row = useDatabase()
    .select({ max: sql<number | null>`max(${notificationChannels.position})` })
    .from(notificationChannels)
    .get()

  return (row?.max ?? -1) + 1
}

export function nextNotificationGroupPosition(): number {
  const row = useDatabase()
    .select({ max: sql<number | null>`max(${notificationGroups.position})` })
    .from(notificationGroups)
    .get()

  return (row?.max ?? -1) + 1
}

export function listNotificationGroups(): NotificationGroup[] {
  const channelIds = loadGroupChannelIds()

  return listNotificationGroupRows().map(row => serializeNotificationGroup(row, channelIds.get(row.id) ?? []))
}

export function getNotificationGroupRow(id: number): NotificationGroupRow | undefined {
  return useDatabase().select().from(notificationGroups).where(eq(notificationGroups.id, id)).get()
}

/**
 * The notification groups that actually apply to a monitor.
 *
 * `custom` and `muted` are decisions and end the search; `inherit` continues up
 * the monitor tree. Reaching the root without a decision falls back to the
 * groups marked as default, which is what keeps a newly created monitor from
 * being silently unreachable.
 *
 * The tree is small and its depth is capped by MONITOR_GROUP_MAX_DEPTH, so this
 * walks in memory rather than as a recursive CTE — the same trade-off the group
 * helpers already make.
 */
export function resolveNotificationGroups(monitorId: number): NotificationGroup[] {
  const database = useDatabase()
  const monitor = database
    .select({ groupId: monitors.groupId, notificationMode: monitors.notificationMode })
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .get()

  if (!monitor) {
    return []
  }

  const all = listNotificationGroups()
  const byId = new Map(all.map(group => [group.id, group]))
  const monitorAssignments = loadMonitorNotificationGroupIds()
  const groupAssignments = loadMonitorGroupNotificationGroupIds()
  const nodes = new Map(listMonitorGroupRows().map(row => [row.id, row]))

  const chain: NotificationAssignment[] = [{
    notificationMode: monitor.notificationMode,
    notificationGroupIds: monitorAssignments.get(monitorId) ?? []
  }]

  const seen = new Set<number>()
  let current = monitor.groupId

  // `seen` guards against a cycle the API cannot create but a hand-edited
  // database can, so a bad row costs a notification rather than the process.
  while (current !== null && !seen.has(current)) {
    seen.add(current)

    const node = nodes.get(current)

    if (!node) {
      break
    }

    chain.push({
      notificationMode: node.notificationMode,
      notificationGroupIds: groupAssignments.get(node.id) ?? []
    })

    current = node.parentId
  }

  const decided = resolveAssignedGroupIds(chain)
  const ids = decided ?? all.filter(group => group.isDefault).map(group => group.id)

  return ids
    .map(id => byId.get(id))
    .filter((group): group is NotificationGroup => group !== undefined)
}

export function assignedToMonitor(monitorId: number): number[] {
  return useDatabase()
    .select({ groupId: monitorNotificationGroups.groupId })
    .from(monitorNotificationGroups)
    .where(eq(monitorNotificationGroups.monitorId, monitorId))
    .all()
    .map(row => row.groupId)
}

export function assignedToMonitorGroup(monitorGroupId: number): number[] {
  return useDatabase()
    .select({ groupId: monitorGroupNotificationGroups.groupId })
    .from(monitorGroupNotificationGroups)
    .where(eq(monitorGroupNotificationGroups.monitorGroupId, monitorGroupId))
    .all()
    .map(row => row.groupId)
}

/** Rejects an assignment payload naming a group that does not exist. */
export function assertNotificationGroupsExist(groupIds: number[]): void {
  if (!groupIds.length) {
    return
  }

  const found = useDatabase()
    .select({ id: notificationGroups.id })
    .from(notificationGroups)
    .where(inArray(notificationGroups.id, groupIds))
    .all()

  if (found.length !== new Set(groupIds).size) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown notification group' })
  }
}

/**
 * Strips every key the provider declared secret and reports which of them hold a
 * value, so the form can offer to replace a password without ever receiving one.
 *
 * An unknown provider loses its whole configuration rather than part of it: not
 * knowing which keys are sensitive is not a reason to assume none are.
 */
export function serializeNotificationChannel(row: NotificationChannelRow): NotificationChannel {
  const provider = getNotificationProvider(row.provider)
  const config: Record<string, unknown> = {}
  const secretsSet: string[] = []

  if (provider) {
    for (const [key, value] of Object.entries(row.config)) {
      if (!provider.secretKeys.includes(key)) {
        config[key] = row.provider === 'teams' && key === 'format'
          ? normalizeTeamsNotificationFormat(value)
          : value
        continue
      }

      if (typeof value === 'string' ? value.length > 0 : value !== null && value !== undefined) {
        secretsSet.push(key)
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    config,
    secretsSet,
    enabled: row.enabled,
    language: row.language,
    position: row.position,
    lastSuccessAt: row.lastSuccessAt,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listNotificationChannelRows(): NotificationChannelRow[] {
  return useDatabase()
    .select()
    .from(notificationChannels)
    .orderBy(asc(notificationChannels.position), asc(notificationChannels.name), asc(notificationChannels.id))
    .all()
}

export function listNotificationChannels(): NotificationChannel[] {
  return listNotificationChannelRows().map(serializeNotificationChannel)
}

export function getNotificationChannelRow(id: number): NotificationChannelRow | undefined {
  return useDatabase().select().from(notificationChannels).where(eq(notificationChannels.id, id)).get()
}

/**
 * Merges an incoming configuration onto the stored one. A secret the form left
 * out or sent empty is the unchanged secret it never received, not an
 * instruction to clear the field.
 */
export function mergeChannelConfig(
  provider: string,
  incoming: Record<string, unknown>,
  stored: Record<string, unknown> | null
): Record<string, unknown> {
  const secretKeys = new Set(getNotificationProvider(provider)?.secretKeys ?? [])
  const merged: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(incoming)) {
    const empty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

    if (secretKeys.has(key) && empty) {
      continue
    }

    merged[key] = value
  }

  for (const key of secretKeys) {
    if (merged[key] === undefined && stored?.[key] !== undefined) {
      merged[key] = stored[key]
    }
  }

  return merged
}

/**
 * Runs the provider's own validation at save time. Finding out that a channel is
 * misconfigured when the first outage fails to reach anyone is too late.
 */
export function validateChannelConfig(provider: string, config: Record<string, unknown>): Record<string, unknown> {
  const implementation = getNotificationProvider(provider)

  if (!implementation) {
    throw createError({ statusCode: 400, statusMessage: `Unknown notification provider "${provider}"` })
  }

  try {
    return implementation.validateConfig(config)
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid channel configuration',
      cause: error
    })
  }
}

export function assertNotificationChannelsExist(channelIds: number[]): void {
  if (!channelIds.length) {
    return
  }

  const found = useDatabase()
    .select({ id: notificationChannels.id })
    .from(notificationChannels)
    .where(inArray(notificationChannels.id, channelIds))
    .all()

  if (found.length !== new Set(channelIds).size) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown notification channel' })
  }
}

/** Replaces the channels of a group. Duplicates in the payload collapse. */
export function setNotificationGroupChannels(groupId: number, channelIds: number[]): void {
  const database = useDatabase()
  const unique = [...new Set(channelIds)]

  database.transaction((transaction) => {
    transaction.delete(notificationGroupChannels).where(eq(notificationGroupChannels.groupId, groupId)).run()

    if (unique.length) {
      transaction
        .insert(notificationGroupChannels)
        .values(unique.map(channelId => ({ groupId, channelId })))
        .run()
    }
  })
}

export function setMonitorNotificationGroups(monitorId: number, groupIds: number[]): void {
  const database = useDatabase()
  const unique = [...new Set(groupIds)]

  database.transaction((transaction) => {
    transaction.delete(monitorNotificationGroups).where(eq(monitorNotificationGroups.monitorId, monitorId)).run()

    if (unique.length) {
      transaction
        .insert(monitorNotificationGroups)
        .values(unique.map(groupId => ({ monitorId, groupId })))
        .run()
    }
  })
}

export function setMonitorGroupNotificationGroups(monitorGroupId: number, groupIds: number[]): void {
  const database = useDatabase()
  const unique = [...new Set(groupIds)]

  database.transaction((transaction) => {
    transaction
      .delete(monitorGroupNotificationGroups)
      .where(eq(monitorGroupNotificationGroups.monitorGroupId, monitorGroupId))
      .run()

    if (unique.length) {
      transaction
        .insert(monitorGroupNotificationGroups)
        .values(unique.map(groupId => ({ monitorGroupId, groupId })))
        .run()
    }
  })
}

/** Most recent deliveries with the names the log shows, newest first. */
export function listNotificationDeliveries(limit: number): NotificationDelivery[] {
  // One snapshot of the tree for the whole page, rather than one walk per row.
  const groupPath = monitorGroupPathResolver()

  return useDatabase()
    .select({
      delivery: notificationDeliveries,
      channelName: notificationChannels.name,
      monitorName: monitors.name,
      monitorGroupId: monitors.groupId
    })
    .from(notificationDeliveries)
    .innerJoin(notificationChannels, eq(notificationChannels.id, notificationDeliveries.channelId))
    .innerJoin(monitors, eq(monitors.id, notificationDeliveries.monitorId))
    .orderBy(desc(notificationDeliveries.createdAt), desc(notificationDeliveries.id))
    .limit(limit)
    .all()
    .map(row => ({
      id: row.delivery.id,
      channelId: row.delivery.channelId,
      channelName: row.channelName,
      groupId: row.delivery.groupId,
      monitorId: row.delivery.monitorId,
      monitorName: row.monitorName,
      monitorGroupPath: groupPath(row.monitorGroupId),
      eventType: row.delivery.eventType,
      status: row.delivery.status,
      attempts: row.delivery.attempts,
      nextAttemptAt: row.delivery.nextAttemptAt,
      lastError: row.delivery.lastError,
      createdAt: row.delivery.createdAt,
      deliveredAt: row.delivery.deliveredAt
    }))
}
