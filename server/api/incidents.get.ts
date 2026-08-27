import z from 'zod'
import { STATS_RANGE_SECONDS } from '../../shared/utils/stats'

const querySchema = z.object({
  /** Comma separated monitor ids. Omit for every monitor. */
  ids: z.string().optional(),
  range: z.enum(['1h', '24h', '7d', '30d', '1y']).default('30d'),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

/**
 * Outages derived from the check history, plus the reliability figures over the
 * same window. Nothing records an incident, so both are reconstructed per
 * request; see `server/utils/incidents.ts` for what that costs in precision.
 */
export default defineEventHandler(async (event) => {
  const { ids, range, limit } = await getValidatedQuery(event, querySchema.parse)
  const requested = parseIdList(ids)
  const monitorIds = requested.length ? requested : listMonitorIds()
  const incidents = listIncidents(monitorIds, STATS_RANGE_SECONDS[range])

  return {
    range,
    // The summary covers the whole window, the list only the newest page of it.
    summary: summarizeIncidents(incidents, STATS_RANGE_SECONDS[range]),
    incidents: incidents.slice(0, limit)
  }
})
