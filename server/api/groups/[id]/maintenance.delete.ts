import { eq } from 'drizzle-orm'
import { monitorGroups } from '../../../database/schema'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readGroupId(event)

  if (!getMonitorGroupRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  const now = nowInSeconds()

  const updated = useDatabase()
    .update(monitorGroups)
    .set({ maintenanceStartedAt: null, maintenanceUntil: null, updatedAt: now })
    .where(eq(monitorGroups.id, id))
    .returning()
    .get()

  return serializeMonitorGroup(updated, assignedToMonitorGroup(id), groupMaintenanceWindows(id))
})
