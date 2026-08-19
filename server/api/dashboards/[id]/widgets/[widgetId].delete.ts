import { and, eq } from 'drizzle-orm'
import { dashboardWidgets } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const dashboard = findDashboard(readDashboardKey(event))

  if (!dashboard) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const deleted = useDatabase()
    .delete(dashboardWidgets)
    .where(and(eq(dashboardWidgets.id, readWidgetId(event)), eq(dashboardWidgets.dashboardId, dashboard.id)))
    .returning({ id: dashboardWidgets.id })
    .get()

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Widget not found' })
  }

  return { ok: true }
})
