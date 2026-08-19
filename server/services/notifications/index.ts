import { eq, inArray } from 'drizzle-orm'
import type { NotificationEvent } from '../../../shared/types/notification'
import { monitorNotificationChannels, notificationChannels } from '../../database/schema'
import { getNotificationProvider } from './registry'

/**
 * Delivers an event to every enabled channel assigned to the monitor.
 *
 * Failures are logged, never thrown: a broken transport must not affect the
 * check pipeline. Without registered providers this resolves immediately.
 */
export async function dispatchNotificationEvent(event: NotificationEvent): Promise<void> {
  const database = useDatabase()

  const assignments = database
    .select({ channelId: monitorNotificationChannels.channelId })
    .from(monitorNotificationChannels)
    .where(eq(monitorNotificationChannels.monitorId, event.monitor.id))
    .all()

  if (!assignments.length) {
    return
  }

  const channels = database
    .select()
    .from(notificationChannels)
    .where(inArray(notificationChannels.id, assignments.map(assignment => assignment.channelId)))
    .all()
    .filter(channel => channel.enabled)

  await Promise.all(channels.map(async (channel) => {
    const provider = getNotificationProvider(channel.provider)

    if (!provider) {
      console.warn(`[notifications] no provider registered for "${channel.provider}" (channel ${channel.id})`)
      return
    }

    try {
      await provider.send(event, provider.validateConfig(channel.config))
    } catch (error) {
      console.error(`[notifications] channel "${channel.name}" failed:`, error)
    }
  }))
}

export * from './registry'
export type * from './types'
