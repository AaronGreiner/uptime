/**
 * Admin only. A group names the channels it delivers to, and the channel list is
 * not public either.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return listNotificationGroups()
})
