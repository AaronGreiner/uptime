import { reseedDemoData } from '../../services/seed'

/**
 * Replaces everything with a fresh set of demo data. The generated history
 * already carries a spread next check per monitor, so the scheduler picks the
 * new monitors up on its own.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return reseedDemoData()
})
