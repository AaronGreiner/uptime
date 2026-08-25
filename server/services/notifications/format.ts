import type { NotificationEvent, NotificationLocale } from '../../../shared/types/notification'
import { NOTIFICATION_EVENT_KEYS } from '../../../shared/utils/notification'

/** Locale identifiers for `Intl`, which does not know the short codes. */
const INTL_LOCALES: Record<NotificationLocale, string> = { en: 'en-GB', de: 'de-DE' }

export type Translate = (key: string, params?: Record<string, string | number>) => string

/** Accent used for the event, shared by every transport that can show colour. */
export type NotificationTone = 'down' | 'up' | 'warning'

export function toneFor(event: NotificationEvent): NotificationTone {
  if (event.type === 'monitor.up') {
    return 'up'
  }

  return event.type === 'monitor.certificate-expiring' ? 'warning' : 'down'
}

/** Locale key segment for the event, e.g. `down`. */
export function eventKey(event: NotificationEvent): string {
  return NOTIFICATION_EVENT_KEYS[event.type]
}

export function eventTitle(event: NotificationEvent, t: Translate): string {
  return t(`notification.event.${eventKey(event)}.title`, { monitor: event.monitor.name })
}

export function eventSubject(event: NotificationEvent, t: Translate): string {
  return t(`notification.event.${eventKey(event)}.subject`, { monitor: event.monitor.name })
}

/**
 * One sentence under the headline. The check's own message is more specific than
 * the generic wording whenever there is one, so it wins.
 */
export function eventSummary(event: NotificationEvent, t: Translate): string {
  return event.message?.trim() || t(`notification.event.${eventKey(event)}.summary`)
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
 * Link back to the monitor, or null when the instance does not know its own
 * public address. A message without a button beats one pointing at localhost.
 */
export function monitorUrl(monitorId: number): string | null {
  const base = useRuntimeConfig().public.appUrl.trim().replace(/\/+$/, '')

  // Id zero is the placeholder monitor a test message falls back to when the
  // instance has none of its own; there is no page to send anybody to.
  return base && monitorId > 0 ? `${base}/monitors/${monitorId}` : null
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

  const facts = [
    { label: t('notification.field.target'), value: event.monitor.target },
    { label: t('notification.field.status'), value: t(`status.${event.status}`) }
  ]

  if (event.latencyMs !== null) {
    facts.push({ label: t('notification.field.latency'), value: `${event.latencyMs} ms` })
  }

  if (event.certificateExpiresAt !== null && event.type === 'monitor.certificate-expiring') {
    facts.push({
      label: t('notification.field.certificateExpiresAt'),
      value: renderDate(event.certificateExpiresAt)
    })
  }

  if (event.durationSeconds !== null) {
    facts.push({ label: t('notification.field.duration'), value: formatDuration(event.durationSeconds, t) })
  }

  facts.push({ label: t('notification.field.occurredAt'), value: renderTimestamp(event.occurredAt) })

  return facts
}

/** ISO 8601 without milliseconds, which the adaptive card date syntax rejects. */
export function toIsoSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
