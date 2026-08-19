import { and, eq } from 'drizzle-orm'
import { dashboardWidgets } from '../../../../database/schema'
import { widgetInputSchema } from '../../../../../shared/utils/validation'
import { nowInSeconds } from '../../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const dashboard = findDashboard(readDashboardKey(event))

  if (!dashboard) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const widgetId = readWidgetId(event)
  const input = await readValidatedBody(event, widgetInputSchema.parse)

  if (input.monitorId && !getMonitorRow(input.monitorId)) {
    throw createError({ statusCode: 400, statusMessage: 'The referenced monitor does not exist' })
  }

  const updated = useDatabase().update(dashboardWidgets).set({
    type: input.type,
    monitorId: input.monitorId,
    config: input.config,
    layout: input.layout,
    updatedAt: nowInSeconds()
  }).where(and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.dashboardId, dashboard.id)))
    .returning()
    .get()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Widget not found' })
  }

  return serializeWidget(updated)
})
