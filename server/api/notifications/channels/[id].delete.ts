import { eq } from 'drizzle-orm'
import { notificationChannels } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readNotificationChannelId(event)

  if (!getNotificationChannelRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  // The group links and the delivery history follow through the foreign keys.
  useDatabase().delete(notificationChannels).where(eq(notificationChannels.id, id)).run()

  return { ok: true }
})
