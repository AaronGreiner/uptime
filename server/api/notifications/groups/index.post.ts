import { notificationGroups } from '../../../database/schema'
import { notificationGroupInputSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, notificationGroupInputSchema.parse)

  assertNotificationChannelsExist(input.channelIds)

  const now = nowInSeconds()
  const { channelIds, ...values } = input

  const created = useDatabase().insert(notificationGroups).values({
    ...values,
    position: nextNotificationGroupPosition(),
    createdAt: now,
    updatedAt: now
  }).returning().get()

  setNotificationGroupChannels(created.id, channelIds)

  setResponseStatus(event, 201)

  return serializeNotificationGroup(created, channelIds)
})
