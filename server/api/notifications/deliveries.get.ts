const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Admin only: the log names the channels and carries their error messages. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const requested = Number(getQuery(event).limit)
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT

  return listNotificationDeliveries(limit)
})
