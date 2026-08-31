import { dashboardIcon } from '../../shared/utils/dashboard'
import { monitorGroupIcon } from '../../shared/utils/group'
import { monitorIcon } from '../../shared/utils/monitor'
import { dashboards, monitorGroups, monitors } from '../database/schema'

/** Effective icons currently assigned anywhere, including automatic defaults. */
export function listUsedIcons(): string[] {
  const database = useDatabase()
  const assigned = [
    ...database.select({ icon: monitors.icon, type: monitors.type, updatedAt: monitors.updatedAt })
      .from(monitors).all().map(row => ({ icon: monitorIcon(row), updatedAt: row.updatedAt })),
    ...database.select({ icon: monitorGroups.icon, updatedAt: monitorGroups.updatedAt })
      .from(monitorGroups).all().map(row => ({ icon: monitorGroupIcon(row), updatedAt: row.updatedAt })),
    ...database.select({ icon: dashboards.icon, isDefault: dashboards.isDefault, updatedAt: dashboards.updatedAt })
      .from(dashboards).all().map(row => ({ icon: dashboardIcon(row), updatedAt: row.updatedAt }))
  ].sort((a, b) => b.updatedAt - a.updatedAt)

  return [...new Set(assigned.map(row => row.icon))]
}
