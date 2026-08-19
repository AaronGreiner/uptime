import type { StatsRange } from './stats'

/** Widget kinds that can be placed on a dashboard grid. */
export type WidgetType
  = | 'monitor'
    | 'uptime-summary'
    | 'latency-chart'
    | 'status-overview'
    | 'heading'

/** Breakpoints mirrored from grid-layout-plus, largest to smallest. */
export type GridBreakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs'

export interface WidgetPosition {
  x: number
  y: number
  w: number
  h: number
}

export type WidgetLayout = Record<GridBreakpoint, WidgetPosition>

export interface WidgetConfig {
  /** Overrides the auto-generated widget title. */
  title?: string
  /** Time range used by data driven widgets. */
  range?: StatsRange
  /** Number of heartbeats rendered by monitor widgets. */
  heartbeatCount?: number
  /** Heading widgets only. */
  level?: 1 | 2 | 3
  /** Monitor ids used by aggregate widgets. Empty means "all monitors". */
  monitorIds?: number[]
}

export interface DashboardWidget {
  id: number
  dashboardId: number
  type: WidgetType
  monitorId: number | null
  config: WidgetConfig
  layout: WidgetLayout
  createdAt: number
  updatedAt: number
}

export interface Dashboard {
  id: number
  slug: string
  name: string
  description: string | null
  isDefault: boolean
  position: number
  createdAt: number
  updatedAt: number
}

export interface DashboardWithWidgets extends Dashboard {
  widgets: DashboardWidget[]
}
