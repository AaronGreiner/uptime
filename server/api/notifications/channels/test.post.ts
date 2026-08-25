import { notificationChannelTestSchema } from '../../../../shared/utils/validation'
import { sendThroughChannel } from '../../../services/notifications/queue'
import { buildSampleEvent } from '../../../services/notifications/sample'

/**
 * Sends one message immediately, past the queue.
 *
 * Deliberately not queued: the person is standing in front of the dialog waiting
 * for an answer, and the transport's own words are the only thing that helps
 * with a wrong password or a rejected webhook. The queue's watchdog still
 * applies, so a silent server cannot hold the request open.
 *
 * Accepts an unsaved channel as well, which is what makes it useful before the
 * first save; an `id` lets the stored secrets fill in what the form left blank.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, notificationChannelTestSchema.parse)
  const existing = input.id === null ? undefined : getNotificationChannelRow(input.id)
  const stored = existing && existing.provider === input.provider ? existing.config : null
  const config = validateChannelConfig(input.provider, mergeChannelConfig(input.provider, input.config, stored))

  try {
    await sendThroughChannel({
      id: existing?.id ?? 0,
      name: input.name,
      provider: input.provider,
      config,
      enabled: true,
      language: input.language,
      position: 0,
      lastSuccessAt: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: 0,
      updatedAt: 0
    }, buildSampleEvent(input.language))
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'The test message could not be delivered',
      cause: error
    })
  }

  return { ok: true }
})
