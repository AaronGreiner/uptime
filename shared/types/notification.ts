import type { MonitorStatus } from './monitor'
import type { UplinkFault } from './uplink'

/**
 * Notification layer contracts.
 *
 * A channel is one transport with its credentials. A notification group bundles
 * channels with the events they react to, and monitors point at groups rather
 * than at channels, so the same channel can behave differently per group.
 */

/** Identifier of a provider implementation, e.g. `email` or `teams`. */
export type NotificationProviderId = string

/** Events about one monitor, which is what almost everything here is about. */
export type MonitorNotificationEventType = 'monitor.down' | 'monitor.up' | 'monitor.certificate-expiring'

/**
 * Events about the instance itself.
 *
 * There is deliberately no counterpart announcing the *start* of an uplink
 * outage: a host with no network cannot deliver the message saying it has no
 * network. The restoration reports the outage after the fact, which is the only
 * moment such a message can be sent at all.
 */
export type InstanceNotificationEventType = 'instance.uplink-restored'

export type NotificationEventType = MonitorNotificationEventType | InstanceNotificationEventType

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
  /** Whether the group hears about the instance losing its own network. */
  notifyInstanceOffline: boolean
  /** Used by monitors whose inheritance walk reaches the root undecided. */
  isDefault: boolean
  position: number
  channelIds: number[]
  createdAt: number
  updatedAt: number
}

interface NotificationEventBase {
  occurredAt: number
  message: string | null
  /** How long the state that just ended had held, in seconds. */
  durationSeconds: number | null
}

export interface MonitorNotificationEvent extends NotificationEventBase {
  type: MonitorNotificationEventType
  monitor: {
    id: number
    name: string
    type: string
    target: string
    /** Group names from the root down to the monitor's direct group. */
    groupPath: string[]
  }
  status: MonitorStatus
  latencyMs: number | null
  /** Expiry of the monitor's certificate in Unix seconds, when one is known. */
  certificateExpiresAt: number | null
}

/**
 * An event about the instance rather than about anything it watches, which is
 * why it carries no monitor at all instead of a placeholder one: everything
 * downstream — the delivery row, the subject line, the link back — has to face
 * that there is nothing to name, and a stand-in monitor would only hide it.
 */
export interface InstanceNotificationEvent extends NotificationEventBase {
  type: InstanceNotificationEventType
  /** Monitors whose checks went unjudged while the instance was blind. */
  affectedMonitors: number
  /** What the probe could not do, so the message can say where to look. */
  fault: UplinkFault | null
}

export type NotificationEvent = MonitorNotificationEvent | InstanceNotificationEvent

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
  /** Null for an event about the instance, which names no monitor. */
  monitorId: number | null
  monitorName: string | null
  /** Group names from the root down to the monitor's direct group. */
  monitorGroupPath: string[]
  eventType: NotificationEventType
  status: NotificationDeliveryStatus
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  createdAt: number
  deliveredAt: number | null
}
