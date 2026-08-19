import type { MonitorStatus } from './monitor'

/**
 * Notification layer contracts.
 *
 * No provider ships with the application yet. The schema, the dispatch hook and
 * this contract exist so a provider can be added without touching the check
 * pipeline. See CLAUDE.md for the steps to register one.
 */

/** Identifier of a provider implementation, e.g. `webhook` or `smtp`. */
export type NotificationProviderId = string

export type NotificationEventType = 'monitor.down' | 'monitor.up' | 'monitor.certificate-expiring'

export interface NotificationChannel {
  id: number
  name: string
  provider: NotificationProviderId
  /** Provider specific settings, validated by the provider itself. */
  config: Record<string, unknown>
  enabled: boolean
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
}
