import z from 'zod'
import { STATS_RANGE_SECONDS } from '../../../shared/utils/stats'

const querySchema = z.object({
  /** Comma separated monitor ids. Omit for every monitor. */
  ids: z.string().optional(),
  range: z.enum(['1h', '24h', '7d', '30d', '1y']).default('24h')
})

/**
 * Uptime for many monitors in one query, which is what an SLA table needs. The
 * per-monitor endpoint would issue one request per row.
 */
export default defineEventHandler(async (event) => {
  const { ids, range } = await getValidatedQuery(event, querySchema.parse)
  const requested = parseIdList(ids)
  const monitorIds = requested.length ? requested : listMonitorIds()
  const uptime = calculateUptimeBulk(monitorIds, STATS_RANGE_SECONDS[range])

  return {
    range,
    monitors: monitorIds.map(monitorId => ({
      monitorId,
      uptime: uptime.get(monitorId) ?? emptyUptime()
    }))
  }
})
