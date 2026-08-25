import type { MonitorStatus } from './monitor'

/**
 * Notification layer contracts.
 *
 * A channel is one transport with its credentials. A notification group bundles
 * channels with the events they react to, and monitors point at groups rather
 * than at channels, so the same channel can behave differently per group.
 */

/** Identifier of a provider implementation, e.g. `email` or `teams`. */
export type NotificationProviderId = string

export type NotificationEventType = 'monitor.down' | 'monitor.up' | 'monitor.certificate-expiring'

/** Language a channel renders its messages in. Mirrors the available locales. */
export type NotificationLocale = 'en' | 'de'

/**
 * How a monitor or a monitor group picks the notification groups it uses.
 * `inherit` continues the walk up the monitor tree, `custom` uses the row's own
 * assignment, and `muted` ends the walk without delivering anything.
 *
 * The mode is stored explicitly rather than inferred from an empty assignment:
 * "delivers nothing on purpose" and "has not been configured" need to be
 * distinguishable, otherwise a monitor cannot be silenced without silencing the
 * group it belongs to.
 */
export type NotificationMode = 'inherit' | 'custom' | 'muted'

export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed'

export interface NotificationChannel {
  id: number
  name: string
  provider: NotificationProviderId
  /**
   * Provider specific settings, validated by the provider itself. The keys a
   * provider declares as secret are removed entirely before this leaves the
   * server; `secretsSet` says which of them hold a value.
   */
  config: Record<string, unknown>
  secretsSet: string[]
  enabled: boolean
  language: NotificationLocale
  position: number
  lastSuccessAt: number | null
  lastError: string | null
  lastErrorAt: number | null
  createdAt: number
  updatedAt: number
}

export interface NotificationGroup {
  id: number
  name: string
  description: string | null
  enabled: boolean
  notifyDown: boolean
  notifyUp: boolean
  notifyCertificateExpiring: boolean
  /** Used by monitors whose inheritance walk reaches the root undecided. */
  isDefault: boolean
  position: number
  channelIds: number[]
  createdAt: number
  updatedAt: number
}

export interface NotificationEvent {
  type: NotificationEventType
  monitor: {
    id: number
    name: string
    type: string
    target: string
  }
  status: MonitorStatus
  message: string | null
  latencyMs: number | null
  occurredAt: number
  /** How long the monitor held the status it just left, in seconds. */
  durationSeconds: number | null
  /** Expiry of the monitor's certificate in Unix seconds, when one is known. */
  certificateExpiresAt: number | null
}

/**
 * One attempt to hand an event to one channel. Doubles as the queue: a row is
 * written while the check runs and picked up by the worker afterwards, so no
 * transport ever executes on the check path.
 */
export interface NotificationDelivery {
  id: number
  channelId: number
  channelName: string
  /** Null once the group that caused the delivery has been deleted. */
  groupId: number | null
  monitorId: number
  monitorName: string
  eventType: NotificationEventType
  status: NotificationDeliveryStatus
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  createdAt: number
  deliveredAt: number | null
}
