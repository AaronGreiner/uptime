import type { NotificationEvent } from '../../../shared/types/notification'

/**
 * Contract every notification transport implements. Providers are registered at
 * boot and resolved by the id stored on a notification channel row.
 */
export interface NotificationProvider {
  /** Stable identifier persisted in `notification_channels.provider`. */
  readonly id: string
  /** Translation key suffix used for the label in the UI. */
  readonly labelKey: string
  /**
   * Validates and normalises the raw channel configuration. Throwing here marks
   * the channel as misconfigured instead of failing silently at delivery time.
   */
  validateConfig: (config: Record<string, unknown>) => Record<string, unknown>
  /** Delivers a single event. Rejections are logged and do not retry. */
  send: (event: NotificationEvent, config: Record<string, unknown>) => Promise<void>
}
