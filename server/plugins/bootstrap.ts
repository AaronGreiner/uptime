import { startMaintenance, stopMaintenance } from '../services/maintenance'
import { registerBuiltinNotificationProviders } from '../services/notifications/providers'
import { startNotificationQueue, stopNotificationQueue } from '../services/notifications/queue'
import { rescheduleAllMonitors, startScheduler, stopScheduler } from '../services/scheduler'
import { seedAdminUser, seedDefaultDashboard, seedDemoData } from '../services/seed'

/**
 * Single boot sequence. Migrations, seeding and the background workers live in
 * one plugin on purpose: Nitro does not await asynchronous plugins, so splitting
 * them would let the scheduler start against a half-prepared database.
 */
export default defineNitroPlugin(async (nitro) => {
  if (import.meta.prerender) {
    return
  }

  migrateDatabase()

  await seedAdminUser()
  seedDefaultDashboard()

  const config = useRuntimeConfig()

  if (config.seed.demoData) {
    seedDemoData()
  }

  registerBuiltinNotificationProviders()
  startNotificationQueue()
  startMaintenance()

  nitro.hooks.hook('close', () => {
    stopScheduler()
    stopNotificationQueue()
    stopMaintenance()
  })

  if (!config.scheduler.enabled) {
    console.info('[scheduler] disabled via configuration, no checks will run')
    return
  }

  // Spreads the first round of checks so a restart does not fire everything at
  // once. Runs after seeding so freshly created monitors are included.
  rescheduleAllMonitors()
  startScheduler()
})
