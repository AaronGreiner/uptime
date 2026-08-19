import { dashboardWidgets } from '../../../../database/schema'
import { buildDefaultWidgetLayout } from '../../../../../shared/utils/grid'
import { widgetInputSchema } from '../../../../../shared/utils/validation'
import { nowInSeconds } from '../../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const dashboard = findDashboard(readDashboardKey(event))

  if (!dashboard) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const input = await readValidatedBody(event, widgetInputSchema.parse)

  if (input.monitorId && !getMonitorRow(input.monitorId)) {
    throw createError({ statusCode: 400, statusMessage: 'The referenced monitor does not exist' })
  }

  const now = nowInSeconds()
  const created = useDatabase().insert(dashboardWidgets).values({
    dashboardId: dashboard.id,
    type: input.type,
    monitorId: input.monitorId,
    config: input.config,
    layout: input.layout ?? buildDefaultWidgetLayout(input.type, 0, nextFreeRow(dashboard.id)),
    createdAt: now,
    updatedAt: now
  }).returning().get()

  setResponseStatus(event, 201)

  return serializeWidget(created)
})
