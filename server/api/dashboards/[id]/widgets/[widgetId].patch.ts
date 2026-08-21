import { and, eq } from 'drizzle-orm'
import { dashboardWidgets } from '../../../../database/schema'
import { clampWidgetSize } from '../../../../../shared/utils/grid'
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
  const existing = useDatabase().select().from(dashboardWidgets)
    .where(and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.dashboardId, dashboard.id)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Widget not found' })
  }

  if (input.monitorId && !getMonitorRow(input.monitorId)) {
    throw createError({ statusCode: 400, statusMessage: 'The referenced monitor does not exist' })
  }

  const size = clampWidgetSize(input.type, input.width ?? existing.width, input.height ?? existing.height)
  const updated = useDatabase().update(dashboardWidgets).set({
    type: input.type,
    monitorId: input.monitorId,
    config: input.config,
    ...size,
    updatedAt: nowInSeconds()
  }).where(and(eq(dashboardWidgets.id, widgetId), eq(dashboardWidgets.dashboardId, dashboard.id)))
    .returning()
    .get()

  return serializeWidget(updated)
})
