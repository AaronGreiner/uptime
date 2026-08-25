import { notificationChannels } from '../../../database/schema'
import { notificationChannelInputSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, notificationChannelInputSchema.parse)
  const config = validateChannelConfig(input.provider, input.config)
  const now = nowInSeconds()

  const created = useDatabase().insert(notificationChannels).values({
    name: input.name,
    provider: input.provider,
    config,
    enabled: input.enabled,
    language: input.language,
    position: nextChannelPosition(),
    createdAt: now,
    updatedAt: now
  }).returning().get()

  setResponseStatus(event, 201)

  return serializeNotificationChannel(created)
})
