import { and, desc, eq, inArray } from 'drizzle-orm'
import type { NotificationEvent } from '../../../shared/types/notification'
import { groupWantsEvent } from '../../../shared/utils/notification'
import { notificationChannels, notificationDeliveries } from '../../database/schema'

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

  const groups = resolveNotificationGroups(event.monitor.id).filter(group => groupWantsEvent(group, event.type))

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
  const rows = channels
    .filter(channel => shouldDeliver(event, channel.id))
    .map(channel => ({
      channelId: channel.id,
      groupId: claims.get(channel.id) ?? null,
      monitorId: event.monitor.id,
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
  if (event.type !== 'monitor.up') {
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

export * from './registry'
export type * from './types'
