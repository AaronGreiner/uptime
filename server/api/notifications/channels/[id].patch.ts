import { eq } from 'drizzle-orm'
import { notificationChannels } from '../../../database/schema'
import { notificationChannelInputSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readNotificationChannelId(event)
  const existing = getNotificationChannelRow(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  const input = await readValidatedBody(event, notificationChannelInputSchema.parse)

  // A secret the form never received cannot be sent back, so an absent one means
  // "unchanged" — but only while the transport stays the same.
  const stored = input.provider === existing.provider ? existing.config : null
  const config = validateChannelConfig(input.provider, mergeChannelConfig(input.provider, input.config, stored))

  useDatabase().update(notificationChannels).set({
    name: input.name,
    provider: input.provider,
    config,
    enabled: input.enabled,
    language: input.language,
    updatedAt: nowInSeconds()
  }).where(eq(notificationChannels.id, id)).run()

  return serializeNotificationChannel(getNotificationChannelRow(id)!)
})
