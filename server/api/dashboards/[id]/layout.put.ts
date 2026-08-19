import { and, eq } from 'drizzle-orm'
import { dashboardWidgets } from '../../../database/schema'
import { dashboardLayoutSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

/** Bulk update written once when the admin leaves edit mode. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const dashboard = findDashboard(readDashboardKey(event))

  if (!dashboard) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const { widgets } = await readValidatedBody(event, dashboardLayoutSchema.parse)
  const database = useDatabase()
  const now = nowInSeconds()

  database.transaction((transaction) => {
    for (const widget of widgets) {
      transaction.update(dashboardWidgets)
        .set({ layout: widget.layout, updatedAt: now })
        .where(and(eq(dashboardWidgets.id, widget.id), eq(dashboardWidgets.dashboardId, dashboard.id)))
        .run()
    }
  })

  return getDashboardWithWidgets(String(dashboard.id))
})
