/**
 * Extension point for notification transports.
 *
 * No transport ships with the application yet. To add one, implement
 * `NotificationProvider`, then call `registerNotificationProvider` from here.
 * Everything downstream - the channel table, the monitor assignment table and
 * the dispatch call in the scheduler - is already wired up.
 *
 * Example skeleton:
 *
 * ```ts
 * registerNotificationProvider({
 *   id: 'webhook',
 *   labelKey: 'webhook',
 *   validateConfig(config) {
 *     if (typeof config.url !== 'string') throw new Error('url is required')
 *     return { url: config.url }
 *   },
 *   async send(event, config) {
 *     await $fetch(config.url as string, { method: 'POST', body: event })
 *   }
 * })
 * ```
 */
export function registerBuiltinNotificationProviders(): void {
  // Intentionally empty until the first transport is implemented.
}
