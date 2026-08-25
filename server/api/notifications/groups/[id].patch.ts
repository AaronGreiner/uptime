import { eq } from 'drizzle-orm'
import { notificationGroups } from '../../../database/schema'
import { notificationGroupInputSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readNotificationGroupId(event)

  if (!getNotificationGroupRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Notification group not found' })
  }

  const input = await readValidatedBody(event, notificationGroupInputSchema.parse)

  assertNotificationChannelsExist(input.channelIds)

  const { channelIds, ...values } = input

  useDatabase()
    .update(notificationGroups)
    .set({ ...values, updatedAt: nowInSeconds() })
    .where(eq(notificationGroups.id, id))
    .run()

  setNotificationGroupChannels(id, channelIds)

  return serializeNotificationGroup(getNotificationGroupRow(id)!, channelIds)
})
