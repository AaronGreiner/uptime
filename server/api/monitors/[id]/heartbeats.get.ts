import { z } from 'zod'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50)
})

export default defineEventHandler(async (event) => {
  const id = readMonitorId(event)
  const { limit } = await getValidatedQuery(event, querySchema.parse)

  if (!getMonitorRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  return getHeartbeats(id, limit)
})
