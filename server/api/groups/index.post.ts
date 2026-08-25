import { monitorGroups } from '../../database/schema'
import { monitorGroupInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, monitorGroupInputSchema.parse)

  assertValidParent(null, input.parentId)
  assertNotificationGroupsExist(input.notificationGroupIds)

  const now = nowInSeconds()
  const { notificationGroupIds, ...values } = input
  const created = useDatabase().insert(monitorGroups).values({
    ...values,
    position: nextGroupPosition(input.parentId),
    createdAt: now,
    updatedAt: now
  }).returning().get()

  setMonitorGroupNotificationGroups(created.id, notificationGroupIds)

  setResponseStatus(event, 201)

  return serializeMonitorGroup(created, notificationGroupIds)
})
