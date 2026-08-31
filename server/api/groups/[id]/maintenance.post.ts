import { eq } from 'drizzle-orm'
import { monitorGroups } from '../../../database/schema'
import { maintenanceOverrideSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

/** Puts a whole node of the monitor tree into maintenance by hand. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readGroupId(event)

  if (!getMonitorGroupRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  const { durationSeconds } = await readValidatedBody(event, maintenanceOverrideSchema.parse)
  const now = nowInSeconds()

  const updated = useDatabase()
    .update(monitorGroups)
    .set({
      maintenanceStartedAt: now,
      maintenanceUntil: durationSeconds === null ? null : now + durationSeconds,
      updatedAt: now
    })
    .where(eq(monitorGroups.id, id))
    .returning()
    .get()

  return serializeMonitorGroup(updated, assignedToMonitorGroup(id), groupMaintenanceWindows(id))
})
