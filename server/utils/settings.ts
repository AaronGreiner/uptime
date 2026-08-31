import { eq } from 'drizzle-orm'
import { settings } from '../database/schema'

/** Reads a JSON encoded setting, falling back to the supplied default. */
export function getSetting<T>(key: string, fallback: T): T {
  const row = useDatabase().select().from(settings).where(eq(settings.key, key)).get()

  return row === undefined ? fallback : row.value as T
}

export function setSetting(key: string, value: unknown): void {
  const updatedAt = Math.floor(Date.now() / 1000)

  useDatabase()
    .insert(settings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run()
}

export const SETTING_KEYS = {
  /** Start of the last hour bucket covered by the aggregation job. */
  aggregatedThrough: 'stats.aggregatedThrough',
  /** Marks a database that already received the demo seed. */
  demoSeeded: 'seed.demoSeeded',
  /** IANA zone the maintenance windows are read in, instance wide. */
  maintenanceTimeZone: 'maintenance.timeZone'
} as const
