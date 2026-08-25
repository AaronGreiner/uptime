import { asc } from 'drizzle-orm'
import type { NotificationEvent, NotificationLocale } from '../../../shared/types/notification'
import { monitorTarget } from '../../../shared/utils/monitor'
import { monitors } from '../../database/schema'
import { nowInSeconds } from '../scheduler'

/**
 * The event a test message carries.
 *
 * It borrows a real monitor when the instance has one, so the message shows the
 * names and the link the recipients will actually see. The message text says it
 * is a test — `eventSummary` prefers it over the generic wording, which puts the
 * notice right under the headline in every transport without either template
 * knowing about tests.
 */
export function buildSampleEvent(language: NotificationLocale): NotificationEvent {
  const monitor = useDatabase().select().from(monitors).orderBy(asc(monitors.id)).limit(1).get()
  const now = nowInSeconds()

  return {
    type: 'monitor.down',
    monitor: monitor
      ? {
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          target: monitorTarget(monitor),
          groupPath: monitorGroupPath(monitor.groupId)
        }
      : {
          id: 0,
          name: translate(language, 'notification.test.monitorName'),
          type: 'http',
          target: 'https://example.com/health',
          groupPath: []
        },
    status: 'down',
    message: translate(language, 'notification.test.message', { app: useRuntimeConfig().public.appName }),
    latencyMs: null,
    occurredAt: now,
    durationSeconds: null,
    certificateExpiresAt: null
  }
}
