/**
 * Admin only, unlike every other read endpoint in this application. A channel
 * holds SMTP credentials and a Teams workflow URL, and that URL is itself the
 * permission to post into the channel.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return listNotificationChannels()
})
