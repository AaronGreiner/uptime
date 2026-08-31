import { monitors, monitorState } from '../../database/schema'
import { monitorInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, monitorInputSchema.parse)

  assertGroupExists(input.groupId)
  assertNotificationGroupsExist(input.notificationGroupIds)

  const database = useDatabase()
  const now = nowInSeconds()
  const { notificationGroupIds, ...values } = input

  const created = database.insert(monitors).values({
    ...values,
    createdAt: now,
    updatedAt: now
  }).returning().get()

  setMonitorNotificationGroups(created.id, notificationGroupIds)

  // Schedule the first check right away so the card is not empty for a minute.
  // The stored status stays in the evaluated vocabulary; a monitor created
  // inactive reads as paused because of its `active` flag, not because of this.
  database.insert(monitorState).values({
    monitorId: created.id,
    status: 'pending',
    nextCheckAt: now,
    updatedAt: now
  }).run()

  setResponseStatus(event, 201)

  return getMonitorWithState(created.id)
})
