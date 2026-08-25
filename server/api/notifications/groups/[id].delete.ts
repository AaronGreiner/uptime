import { eq } from 'drizzle-orm'
import { notificationGroups } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readNotificationGroupId(event)

  if (!getNotificationGroupRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Notification group not found' })
  }

  // Monitors assigned to nothing else keep their `custom` mode and simply stop
  // notifying, which the UI reports as having no recipients.
  useDatabase().delete(notificationGroups).where(eq(notificationGroups.id, id)).run()

  return { ok: true }
})
