import { clearAllData } from '../../services/seed'

/**
 * Empties the instance. Monitors, groups, dashboards, notification channels and
 * the whole recorded history go; the admin account stays, so the caller keeps
 * its session.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  clearAllData()

  return { ok: true }
})
