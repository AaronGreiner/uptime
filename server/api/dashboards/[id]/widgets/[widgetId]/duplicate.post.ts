import { asc, eq } from 'drizzle-orm'
import { dashboardWidgets } from '../../../../../database/schema'
import { nowInSeconds } from '../../../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const dashboard = findDashboard(readDashboardKey(event))

  if (!dashboard) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const database = useDatabase()
  const widgets = database
    .select()
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, dashboard.id))
    .orderBy(asc(dashboardWidgets.position), asc(dashboardWidgets.id))
    .all()
  const sourceIndex = widgets.findIndex(widget => widget.id === readWidgetId(event))

  if (sourceIndex === -1) {
    throw createError({ statusCode: 404, statusMessage: 'Widget not found' })
  }

  const source = widgets[sourceIndex]!
  const now = nowInSeconds()
  const created = database.transaction((transaction) => {
    for (const [index, widget] of widgets.entries()) {
      const position = index > sourceIndex ? index + 1 : index

      if (widget.position !== position) {
        transaction
          .update(dashboardWidgets)
          .set({ position, updatedAt: now })
          .where(eq(dashboardWidgets.id, widget.id))
          .run()
      }
    }

    return transaction.insert(dashboardWidgets).values({
      dashboardId: dashboard.id,
      type: source.type,
      monitorId: source.monitorId,
      config: source.config,
      position: sourceIndex + 1,
      width: source.width,
      height: source.height,
      createdAt: now,
      updatedAt: now
    }).returning().get()
  })

  setResponseStatus(event, 201)

  return serializeWidget(created)
})
