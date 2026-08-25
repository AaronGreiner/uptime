import type { NotificationAssignment } from '../types/monitor'
import type { NotificationEventType, NotificationGroup } from '../types/notification'

export const NOTIFICATION_MODES = ['inherit', 'custom', 'muted'] as const

/**
 * Transports that can be picked in the UI. The server registry is the authority
 * on what actually delivers; this is the list the form and the payload schema
 * validate against, and the two have to be kept in step by hand.
 */
export const NOTIFICATION_PROVIDERS = ['email', 'teams'] as const

export const NOTIFICATION_EVENT_TYPES = [
  'monitor.down',
  'monitor.up',
  'monitor.certificate-expiring'
] as const

export const NOTIFICATION_LOCALES = ['en', 'de'] as const

/** Default for transports that have to render a timestamp before delivery. */
export const NOTIFICATION_DEFAULT_TIME_ZONE = 'Europe/Berlin'

export const TEAMS_NOTIFICATION_FORMATS = ['card', 'message'] as const

/** Reads channels saved while the removed experimental HTML format existed. */
export function normalizeTeamsNotificationFormat(value: unknown): unknown {
  return value === 'modern' ? 'message' : value
}

export const NOTIFICATION_DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const

/**
 * Maps an event onto the group switch that decides whether it is delivered.
 * Keeping the mapping here rather than in a conditional means adding an event
 * type fails to compile until the switch exists.
 */
export const NOTIFICATION_EVENT_FLAGS = {
  'monitor.down': 'notifyDown',
  'monitor.up': 'notifyUp',
  'monitor.certificate-expiring': 'notifyCertificateExpiring'
} as const satisfies Record<NotificationEventType, keyof NotificationGroup>

/**
 * Locale key segment per event type. The event ids contain dots, which the
 * translator reads as path separators, so they cannot be keys themselves.
 */
export const NOTIFICATION_EVENT_KEYS = {
  'monitor.down': 'down',
  'monitor.up': 'up',
  'monitor.certificate-expiring': 'certificate'
} as const satisfies Record<NotificationEventType, string>

/** True when the group is enabled and reacts to this kind of event. */
export function groupWantsEvent(group: NotificationGroup, type: NotificationEventType): boolean {
  return group.enabled && group[NOTIFICATION_EVENT_FLAGS[type]] === true
}

/** Iconify names per transport, also bundled by name in `nuxt.config.ts`. */
export const NOTIFICATION_PROVIDER_ICONS: Record<string, string> = {
  email: 'i-lucide-mail',
  teams: 'i-simple-icons-microsoftteams'
}

export function notificationProviderIcon(provider: string): string {
  return NOTIFICATION_PROVIDER_ICONS[provider] ?? 'i-lucide-bell'
}

/**
 * Decides which notification groups apply, given the chain of records that may
 * decide it: the monitor first, then its group, that group's parent, and so on.
 *
 * `custom` and `muted` are both decisions and end the walk; `inherit` passes it
 * on. Returning null means nobody decided, which is what lets the groups marked
 * as default apply — the caller resolves that, because only it knows them.
 *
 * Shared so the dialog can show what a monitor would inherit using the very rule
 * the scheduler will apply, rather than an approximation of it.
 */
export function resolveAssignedGroupIds(chain: NotificationAssignment[]): number[] | null {
  for (const source of chain) {
    if (source.notificationMode === 'muted') {
      return []
    }

    if (source.notificationMode === 'custom') {
      return source.notificationGroupIds
    }
  }

  return null
}
