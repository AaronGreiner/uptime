import { dashboards } from '../../database/schema'
import { dashboardInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, dashboardInputSchema.parse)

  if (findDashboard(input.slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A dashboard with this slug already exists' })
  }

  const database = useDatabase()
  const now = nowInSeconds()
  const created = database.insert(dashboards).values({
    ...input,
    position: listDashboards().length,
    createdAt: now,
    updatedAt: now
  }).returning().get()

  if (input.isDefault) {
    clearOtherDefaults(created.id)
  }

  setResponseStatus(event, 201)

  return serializeDashboard(created)
})
