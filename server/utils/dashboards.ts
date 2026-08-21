import { asc, eq, max } from 'drizzle-orm'
import type { Dashboard, DashboardWidget, DashboardWithWidgets } from '../../shared/types/dashboard'
import { clampWidgetSize } from '../../shared/utils/grid'
import { dashboards, dashboardWidgets } from '../database/schema'
import type { DashboardRow, DashboardWidgetRow } from '../database/schema'

export function serializeDashboard(row: DashboardRow): Dashboard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function serializeWidget(row: DashboardWidgetRow): DashboardWidget {
  const size = clampWidgetSize(row.type, row.width, row.height)

  return {
    id: row.id,
    dashboardId: row.dashboardId,
    type: row.type,
    monitorId: row.monitorId,
    config: row.config ?? {},
    position: row.position,
    ...size,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listDashboards(): Dashboard[] {
  return useDatabase()
    .select()
    .from(dashboards)
    .orderBy(asc(dashboards.position), asc(dashboards.id))
    .all()
    .map(serializeDashboard)
}

/** Resolves a route parameter that may be a numeric id or a slug. */
export function findDashboard(key: string): DashboardRow | undefined {
  const database = useDatabase()
  const id = Number(key)

  if (Number.isInteger(id) && id > 0) {
    return database.select().from(dashboards).where(eq(dashboards.id, id)).get()
  }

  return database.select().from(dashboards).where(eq(dashboards.slug, key)).get()
}

export function getDashboardWithWidgets(key: string): DashboardWithWidgets | null {
  const row = findDashboard(key)

  if (!row) {
    return null
  }

  const widgets = useDatabase()
    .select()
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, row.id))
    .orderBy(asc(dashboardWidgets.position), asc(dashboardWidgets.id))
    .all()
    .map(serializeWidget)

  return { ...serializeDashboard(row), widgets }
}

/** Appends a widget after the current last item in the dashboard. */
export function nextWidgetPosition(dashboardId: number): number {
  const row = useDatabase()
    .select({ position: max(dashboardWidgets.position) })
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, dashboardId))
    .get()

  return (row?.position ?? -1) + 1
}

/** Makes sure at most one dashboard carries the default flag. */
export function clearOtherDefaults(dashboardId: number): void {
  useDatabase()
    .update(dashboards)
    .set({ isDefault: false })
    .where(eq(dashboards.isDefault, true))
    .run()

  useDatabase()
    .update(dashboards)
    .set({ isDefault: true })
    .where(eq(dashboards.id, dashboardId))
    .run()
}
