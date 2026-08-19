import { eq } from 'drizzle-orm'
import { monitors } from '../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMonitorId(event)
  const deleted = useDatabase().delete(monitors).where(eq(monitors.id, id)).returning({ id: monitors.id }).get()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  return { ok: true }
})
