import type { MonitorNotificationEvent, NotificationEvent, NotificationLocale } from '../../../shared/types/notification'
import { NOTIFICATION_EVENT_KEYS, isMonitorNotificationEvent } from '../../../shared/utils/notification'

/** Locale identifiers for `Intl`, which does not know the short codes. */
const INTL_LOCALES: Record<NotificationLocale, string> = { en: 'en-GB', de: 'de-DE' }

export type Translate = (key: string, params?: Record<string, string | number>) => string

/** Accent used for the event, shared by every transport that can show colour. */
export type NotificationTone = 'down' | 'up' | 'warning'

export function toneFor(event: NotificationEvent): NotificationTone {
  if (event.type === 'monitor.up') {
    return 'up'
  }

  // A restored uplink is not good news on its own: the instance watched nothing
  // for a while and left a hole in its own record, which is the part the reader
  // has to see. A green tick would say there is nothing here to look at.
  if (event.type === 'instance.uplink-restored') {
    return 'warning'
  }

  return event.type === 'monitor.certificate-expiring' ? 'warning' : 'down'
}

/**
 * Marker in front of a headline that has to be readable at a glance, in a
 * notification preview or a phone banner where nothing else survives.
 */
const TONE_MARKERS: Record<NotificationTone, string> = { down: '🔴', up: '✅', warning: '⚠️' }

export function toneMarker(tone: NotificationTone): string {
  return TONE_MARKERS[tone]
}

/** Escapes everything that came from a monitor, a check message or a URL. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

/** Locale key segment for the event, e.g. `down`. */
export function eventKey(event: NotificationEvent): string {
  return NOTIFICATION_EVENT_KEYS[event.type]
}

/** Group breadcrumb followed by the monitor, ready to embed in a headline. */
export function eventMonitorLabel(event: MonitorNotificationEvent): string {
  return [...(event.monitor.groupPath ?? []), event.monitor.name].join(' › ')
}

/**
 * Placeholders the headline, the subject and the summary are rendered with.
 *
 * A monitor event is named after its monitor; an instance event has none to
 * name, so it is described by what happened instead — how long it lasted and
 * how much of the record it cost.
 */
function eventParams(event: NotificationEvent, t: Translate): Record<string, string | number> {
  if (isMonitorNotificationEvent(event)) {
    return { monitor: eventMonitorLabel(event) }
  }

  return {
    duration: event.durationSeconds === null ? '' : formatDuration(event.durationSeconds, t),
    monitors: event.affectedMonitors
  }
}

export function eventTitle(event: NotificationEvent, t: Translate): string {
  return t(`notification.event.${eventKey(event)}.title`, eventParams(event, t))
}

export function eventSubject(event: NotificationEvent, t: Translate): string {
  return t(`notification.event.${eventKey(event)}.subject`, eventParams(event, t))
}

/** Word on the badge above the headline: the monitor's status, or the kind of event. */
export function eventBadge(event: NotificationEvent, t: Translate): string {
  return isMonitorNotificationEvent(event)
    ? t(`status.${event.status}`)
    : t(`notification.event.${eventKey(event)}.badge`)
}

/**
 * One sentence under the headline. The check's own message is more specific than
 * the generic wording whenever there is one, so it wins.
 */
export function eventSummary(event: NotificationEvent, t: Translate): string {
  return event.message?.trim() || t(`notification.event.${eventKey(event)}.summary`, eventParams(event, t))
}

/**
 * Spelled out component by component rather than with `dateStyle`: naming the
 * zone matters in an alert read at three in the morning, and `Intl` refuses
 * `timeZoneName` alongside the shorthand styles.
 */
export function formatTimestamp(seconds: number, locale: NotificationLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone
  }).format(new Date(seconds * 1000))
}

export function formatDate(seconds: number, locale: NotificationLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: 'medium', timeZone })
    .format(new Date(seconds * 1000))
}

/** Coarse on purpose: "down for 4 min" reads better at 3am than "4 min 12 s". */
export function formatDuration(seconds: number, t: Translate): string {
  if (seconds < 60) {
    return t('notification.duration.seconds', { value: Math.max(0, Math.round(seconds)) })
  }

  if (seconds < 3600) {
    return t('notification.duration.minutes', { value: Math.round(seconds / 60) })
  }

  if (seconds < 86_400) {
    return t('notification.duration.hours', { value: Math.round(seconds / 3600) })
  }

  return t('notification.duration.days', { value: Math.round(seconds / 86_400) })
}

/**
 * The instance's own public address, or null when it does not know one. A
 * message without a button beats one pointing at localhost.
 */
function appBaseUrl(): string | null {
  return useRuntimeConfig().public.appUrl.trim().replace(/\/+$/, '') || null
}

export function monitorUrl(monitorId: number): string | null {
  const base = appBaseUrl()

  // Id zero is the placeholder monitor a test message falls back to when the
  // instance has none of its own; there is no page to send anybody to.
  return base && monitorId > 0 ? `${base}/monitors/${monitorId}` : null
}

/** Where the message's button goes: the monitor, or the instance itself. */
export function eventLink(event: NotificationEvent): string | null {
  return isMonitorNotificationEvent(event) ? monitorUrl(event.monitor.id) : appBaseUrl()
}

export function eventLinkLabel(event: NotificationEvent, t: Translate): string {
  return t(isMonitorNotificationEvent(event) ? 'notification.action.openMonitor' : 'notification.action.openApp')
}

export interface FactOptions {
  locale: NotificationLocale
  timeZone: string
  /**
   * Teams resolves timestamps for whoever opens the card, so it substitutes its
   * own placeholders here instead of a time already fixed to one zone.
   */
  renderTimestamp?: (seconds: number) => string
  renderDate?: (seconds: number) => string
}

/** Label/value pairs every transport shows, in the order they are rendered. */
export function eventFacts(
  event: NotificationEvent,
  t: Translate,
  options: FactOptions
): { label: string, value: string }[] {
  const { locale, timeZone } = options
  const renderTimestamp = options.renderTimestamp ?? (seconds => formatTimestamp(seconds, locale, timeZone))
  const renderDate = options.renderDate ?? (seconds => formatDate(seconds, locale, timeZone))

  const facts = isMonitorNotificationEvent(event)
    ? [
        { label: t('notification.field.target'), value: event.monitor.target },
        { label: t('notification.field.status'), value: t(`status.${event.status}`) }
      ]
    : [
        { label: t('notification.field.fault'), value: t(`notification.fault.${event.fault ?? 'network'}`) },
        { label: t('notification.field.affectedMonitors'), value: String(event.affectedMonitors) }
      ]

  if (isMonitorNotificationEvent(event)) {
    if (event.latencyMs !== null) {
      facts.push({ label: t('notification.field.latency'), value: `${event.latencyMs} ms` })
    }

    if (event.certificateExpiresAt !== null && event.type === 'monitor.certificate-expiring') {
      facts.push({
        label: t('notification.field.certificateExpiresAt'),
        value: renderDate(event.certificateExpiresAt)
      })
    }
  }

  if (event.durationSeconds !== null) {
    facts.push({
      // The same number means two different things: how long the monitor held
      // the status it just left, and how long the instance was unable to look.
      label: t(isMonitorNotificationEvent(event)
        ? 'notification.field.duration'
        : 'notification.field.offlineDuration'),
      value: formatDuration(event.durationSeconds, t)
    })
  }

  facts.push({ label: t('notification.field.occurredAt'), value: renderTimestamp(event.occurredAt) })

  return facts
}

/** ISO 8601 without milliseconds, which the adaptive card date syntax rejects. */
export function toIsoSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
