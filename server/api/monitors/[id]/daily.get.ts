import z from 'zod'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(400).default(90),
  /**
   * Minutes the viewer's zone is ahead of UTC, so the squares line up with the
   * viewer's midnight rather than with UTC's.
   */
  offsetMinutes: z.coerce.number().int().min(-MAX_UTC_OFFSET_MINUTES).max(MAX_UTC_OFFSET_MINUTES).default(0)
})

export default defineEventHandler(async (event) => {
  const id = readMonitorId(event)
  const { days, offsetMinutes } = await getValidatedQuery(event, querySchema.parse)

  if (!getMonitorRow(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  return { days, points: listDailyStats(id, days, offsetMinutes * 60) }
})
