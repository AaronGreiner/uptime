import { eq } from 'drizzle-orm'
import { dashboards } from '../../database/schema'
import { dashboardInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const existing = findDashboard(readDashboardKey(event))

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  }

  const input = await readValidatedBody(event, dashboardInputSchema.parse)
  const conflict = findDashboard(input.slug)

  if (conflict && conflict.id !== existing.id) {
    throw createError({ statusCode: 409, statusMessage: 'A dashboard with this slug already exists' })
  }

  const database = useDatabase()

  database.update(dashboards).set({
    name: input.name,
    icon: input.icon,
    slug: input.slug,
    description: input.description,
    updatedAt: nowInSeconds()
  }).where(eq(dashboards.id, existing.id)).run()

  if (input.isDefault) {
    clearOtherDefaults(existing.id)
  }

  return getDashboardWithWidgets(String(existing.id))
})
