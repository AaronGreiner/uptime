import { eq } from 'drizzle-orm'
import { maintenanceWindows } from '../../../database/schema'
import { maintenanceWindowInputSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMaintenanceWindowId(event)

  if (!getMaintenanceWindowRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Maintenance window not found' })
  }

  const input = await readValidatedBody(event, maintenanceWindowInputSchema.parse)

  assertMaintenanceTargetExists(input)

  // The target is part of the payload, so a window can be moved from one
  // monitor to a group without being deleted and written again.
  const updated = useDatabase()
    .update(maintenanceWindows)
    .set({ ...input, updatedAt: nowInSeconds() })
    .where(eq(maintenanceWindows.id, id))
    .returning()
    .get()

  return serializeMaintenanceWindow(updated)
})
