import { and, eq } from 'drizzle-orm'
import { dashboardWidgets } from '../../../database/schema'
import { clampWidgetSize } from '../../../../shared/utils/grid'
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
  const widgetTypes = new Map(database.select({ id: dashboardWidgets.id, type: dashboardWidgets.type })
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, dashboard.id))
    .all()
    .map(widget => [widget.id, widget.type]))

  database.transaction((transaction) => {
    for (const widget of widgets) {
      const type = widgetTypes.get(widget.id)

      if (!type) {
        continue
      }

      const size = clampWidgetSize(type, widget.width, widget.height)

      transaction.update(dashboardWidgets)
        .set({ position: widget.position, ...size, updatedAt: now })
        .where(and(eq(dashboardWidgets.id, widget.id), eq(dashboardWidgets.dashboardId, dashboard.id)))
        .run()
    }
  })

  return getDashboardWithWidgets(String(dashboard.id))
})
