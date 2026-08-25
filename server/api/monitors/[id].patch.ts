import { eq } from 'drizzle-orm'
import { monitors, monitorState } from '../../database/schema'
import { monitorInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMonitorId(event)
  const existing = getMonitorRow(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  const input = await readValidatedBody(event, monitorInputSchema.parse)

  assertGroupExists(input.groupId)
  assertNotificationGroupsExist(input.notificationGroupIds)

  const database = useDatabase()
  const now = nowInSeconds()
  const { notificationGroupIds, ...values } = input

  database.update(monitors).set({ ...values, updatedAt: now }).where(eq(monitors.id, id)).run()
  setMonitorNotificationGroups(id, notificationGroupIds)

  // A changed interval or a resumed monitor should take effect immediately.
  database.update(monitorState).set({
    status: input.active ? (existing.active ? undefined : 'pending') : 'paused',
    nextCheckAt: now,
    updatedAt: now
  }).where(eq(monitorState.monitorId, id)).run()

  return getMonitorWithState(id)
})
