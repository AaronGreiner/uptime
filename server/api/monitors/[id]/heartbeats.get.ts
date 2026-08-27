import z from 'zod'
import { MONITOR_HEARTBEAT_HISTORY_MAX } from '#shared/utils/monitor'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MONITOR_HEARTBEAT_HISTORY_MAX).default(50)
})

export default defineEventHandler(async (event) => {
  const id = readMonitorId(event)
  const { limit } = await getValidatedQuery(event, querySchema.parse)

  if (!getMonitorRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  return getHeartbeats(id, limit)
})
