import { eq } from 'drizzle-orm'
import { maintenanceWindows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMaintenanceWindowId(event)

  if (!getMaintenanceWindowRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Maintenance window not found' })
  }

  useDatabase().delete(maintenanceWindows).where(eq(maintenanceWindows.id, id)).run()

  setResponseStatus(event, 204)

  return null
})
