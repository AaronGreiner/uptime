import type { NotificationProvider } from './types'

const providers = new Map<string, NotificationProvider>()

export function registerNotificationProvider(provider: NotificationProvider): void {
  providers.set(provider.id, provider)
}

export function getNotificationProvider(id: string): NotificationProvider | undefined {
  return providers.get(id)
}

export function listNotificationProviders(): NotificationProvider[] {
  return [...providers.values()]
}
