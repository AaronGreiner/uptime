import { eq } from 'drizzle-orm'
import { monitors } from '../../../database/schema'
import { maintenanceOverrideSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

/**
 * Puts a monitor into maintenance by hand. A null duration means "until
 * somebody turns it off", which is why the switch stores its start as well: the
 * interface has to be able to say how long an open ended one has been running.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMonitorId(event)

  if (!getMonitorRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  const { durationSeconds } = await readValidatedBody(event, maintenanceOverrideSchema.parse)
  const now = nowInSeconds()

  useDatabase()
    .update(monitors)
    .set({
      maintenanceStartedAt: now,
      maintenanceUntil: durationSeconds === null ? null : now + durationSeconds,
      updatedAt: now
    })
    .where(eq(monitors.id, id))
    .run()

  return getMonitorWithState(id)
})
