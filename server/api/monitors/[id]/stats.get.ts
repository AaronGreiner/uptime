import z from 'zod'
import { STATS_RANGE_SECONDS } from '../../../../shared/utils/stats'

const querySchema = z.object({
  range: z.enum(['1h', '24h', '7d', '30d', '1y']).default('24h')
})

export default defineEventHandler(async (event) => {
  const id = readMonitorId(event)
  const { range } = await getValidatedQuery(event, querySchema.parse)

  if (!getMonitorRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  return {
    range,
    points: getMonitorStatsSeries(id, range),
    uptime: calculateUptimeBulk([id], STATS_RANGE_SECONDS[range]).get(id)
      ?? { ratio: null, upCount: 0, downCount: 0, avgLatencyMs: null }
  }
})
