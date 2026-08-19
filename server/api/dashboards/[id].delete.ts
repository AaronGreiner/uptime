import { eq } from 'drizzle-orm'
import { dashboards } from '../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const existing = findDashboard(readDashboardKey(event))

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const database = useDatabase()

  if (database.select({ id: dashboards.id }).from(dashboards).all().length <= 1) {
    throw createError({ statusCode: 409, statusMessage: 'The last dashboard cannot be deleted' })
  }

  database.delete(dashboards).where(eq(dashboards.id, existing.id)).run()

  // Keep exactly one default dashboard around for the landing redirect.
  if (existing.isDefault) {
    const fallback = database.select().from(dashboards).orderBy(dashboards.position).get()

    if (fallback) {
      clearOtherDefaults(fallback.id)
    }
  }

  return { ok: true }
})
