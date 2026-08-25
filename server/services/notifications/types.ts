import type { NotificationEvent, NotificationLocale } from '../../../shared/types/notification'

/**
 * Everything a provider needs besides the event itself. Passed as one object so
 * adding context later does not change every provider's signature.
 */
export interface NotificationSendContext {
  /** Provider specific settings, already through `validateConfig`. */
  config: Record<string, unknown>
  /** Language to render in. There is no browser locale on this side. */
  language: NotificationLocale
  /** Channel name, used where a message identifies its own source. */
  channelName: string
}

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
   * Config keys holding a secret. They are stripped from every API response, and
   * a payload that omits one keeps the stored value instead of clearing it.
   */
  readonly secretKeys: readonly string[]
  /**
   * Validates and normalises the raw channel configuration. Throwing here marks
   * the delivery as failed instead of letting a broken channel fail silently.
   */
  validateConfig: (config: Record<string, unknown>) => Record<string, unknown>
  /**
   * Delivers a single event. Rejecting hands the delivery back to the queue,
   * which retries it with a growing delay and eventually gives up.
   */
  send: (event: NotificationEvent, context: NotificationSendContext) => Promise<void>
}
