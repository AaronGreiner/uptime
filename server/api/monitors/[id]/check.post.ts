import { runCheckNow } from '../../../services/scheduler'

/** Runs a check on demand, bypassing the schedule. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readMonitorId(event)

  await runCheckNow(id)

  return getMonitorWithState(id)
})
