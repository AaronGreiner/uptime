import { eq } from 'drizzle-orm'
import { monitors } from '../../../database/schema'
import { nowInSeconds } from '../../../services/scheduler'

/**
 * Ends a manual maintenance. The scheduled windows are untouched: they are
 * configuration, not a switch, and are edited through the monitor form.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMonitorId(event)

  if (!getMonitorRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  const now = nowInSeconds()

  useDatabase()
    .update(monitors)
    .set({ maintenanceStartedAt: null, maintenanceUntil: null, updatedAt: now })
    .where(eq(monitors.id, id))
    .run()

  return getMonitorWithState(id)
})
