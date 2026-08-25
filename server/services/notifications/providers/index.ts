import { registerEmailProvider } from './email'
import { registerTeamsProvider } from './teams'

/**
 * Registration point for the notification transports. Called once from the boot
 * plugin, before the queue worker starts, so a provider that is missing is a
 * configuration error rather than a race.
 *
 * Adding one means implementing `NotificationProvider` in this folder and
 * registering it here. Everything downstream — the channels, the notification
 * groups, the queue and its retries — is already wired up.
 */
export function registerBuiltinNotificationProviders(): void {
  registerEmailProvider()
  registerTeamsProvider()
}
