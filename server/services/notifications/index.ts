import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { NotificationEvent, NotificationGroup } from '../../../shared/types/notification'
import type { UplinkStatus } from '../../../shared/types/uplink'
import { groupWantsEvent, isMonitorNotificationEvent } from '../../../shared/utils/notification'
import { heartbeats, notificationChannels, notificationDeliveries } from '../../database/schema'
import { nowInSeconds } from '../scheduler'

/**
 * Turns an event into one queued delivery per channel that should receive it.
 *
 * Deliberately synchronous and free of any network call: this runs while the
 * scheduler still holds the monitor in its in-flight set, so anything slow here
 * would stop that monitor from being checked again. The queue worker in
 * `queue.ts` does the talking.
 */
export function enqueueNotificationEvent(event: NotificationEvent): void {
  const database = useDatabase()
  const { notifications } = useRuntimeConfig()

  if (!notifications.enabled) {
    return
  }

  const groups = audienceFor(event).filter(group => groupWantsEvent(group, event.type))

  if (!groups.length) {
    return
  }

  // A channel named by several matching groups is still one message. The first
  // group to claim it is recorded so the delivery log can say where it came from.
  //
  // Groups add up rather than restrict each other: a channel reached through a
  // group that wants recoveries gets them even when a second group it belongs to
  // has them switched off. Silencing a channel means keeping it out of the group
  // that is loud, not adding a quiet one next to it.
  const claims = new Map<number, number>()

  for (const group of groups) {
    for (const channelId of group.channelIds) {
      if (!claims.has(channelId)) {
        claims.set(channelId, group.id)
      }
    }
  }

  if (!claims.size) {
    return
  }

  const channels = database
    .select({ id: notificationChannels.id })
    .from(notificationChannels)
    .where(and(
      inArray(notificationChannels.id, [...claims.keys()]),
      eq(notificationChannels.enabled, true)
    ))
    .all()

  // The event carries the moment the check produced it, which is the clock this
  // queue should run on rather than a second reading taken here.
  const now = event.occurredAt
  const monitorId = isMonitorNotificationEvent(event) ? event.monitor.id : null
  const rows = channels
    .filter(channel => shouldDeliver(event, channel.id))
    .map(channel => ({
      channelId: channel.id,
      groupId: claims.get(channel.id) ?? null,
      monitorId,
      eventType: event.type,
      payload: event,
      status: 'pending' as const,
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now
    }))

  if (rows.length) {
    database.insert(notificationDeliveries).values(rows).run()
  }
}

/**
 * A recovery only makes sense to someone who was told about the outage. A group
 * that was disabled, muted or only assigned while the monitor was already down
 * would otherwise announce the end of an incident it never mentioned.
 *
 * The last delivery for this monitor and channel answers that: if it was an
 * outage, the recovery belongs to it. Pending counts as well, so a monitor that
 * flaps faster than the queue drains still reports both halves.
 */
function shouldDeliver(event: NotificationEvent, channelId: number): boolean {
  if (event.type !== 'monitor.up' || !isMonitorNotificationEvent(event)) {
    return true
  }

  const previous = useDatabase()
    .select({ eventType: notificationDeliveries.eventType })
    .from(notificationDeliveries)
    .where(and(
      eq(notificationDeliveries.monitorId, event.monitor.id),
      eq(notificationDeliveries.channelId, channelId),
      inArray(notificationDeliveries.eventType, ['monitor.down', 'monitor.up']),
      inArray(notificationDeliveries.status, ['pending', 'sent'])
    ))
    .orderBy(desc(notificationDeliveries.createdAt), desc(notificationDeliveries.id))
    .limit(1)
    .get()

  return previous?.eventType === 'monitor.down'
}

/**
 * The groups an event is offered to.
 *
 * A monitor event walks the monitor tree, because the tree is what decides
 * which group a monitor belongs to. An instance event has no place in that
 * tree — it is about the thing the tree hangs from — so it is offered to every
 * group, and the group's own switch is where it is turned off. Falling back to
 * the default groups instead would be the quieter rule and the wrong one: an
 * instance with no default group would report its own blindness to nobody.
 */
function audienceFor(event: NotificationEvent): NotificationGroup[] {
  return isMonitorNotificationEvent(event)
    ? resolveNotificationGroups(event.monitor.id)
    : listNotificationGroups()
}

/**
 * Reports an uplink outage once it is over, which is the only moment it can be
 * reported at all: while it ran, nothing could leave the host.
 *
 * Called from the uplink listener, which fires inside a check. It carries the
 * same constraint as everything else on that path — one query, no network.
 */
export function enqueueUplinkRestored(outage: UplinkStatus): void {
  const startedAt = outage.since

  if (startedAt === null) {
    return
  }

  const now = nowInSeconds()
  const affected = useDatabase()
    .select({ monitors: sql<number>`count(distinct ${heartbeats.monitorId})` })
    .from(heartbeats)
    .where(and(
      eq(heartbeats.reportedStatus, 'unknown'),
      gte(heartbeats.checkedAt, startedAt)
    ))
    .get()

  enqueueNotificationEvent({
    type: 'instance.uplink-restored',
    occurredAt: now,
    message: null,
    durationSeconds: now - startedAt,
    affectedMonitors: affected?.monitors ?? 0,
    fault: outage.fault
  })
}

export * from './registry'
export type * from './types'
