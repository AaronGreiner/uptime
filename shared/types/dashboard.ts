import type { LatencyChartStyle } from './monitor'
import type { StatsRange } from './stats'

/** Widget kinds that can be placed on a dashboard grid. */
export type WidgetType
  = | 'monitor'
    | 'uptime-summary'
    | 'latency-chart'
    | 'uptime-calendar'
    | 'status-overview'
    | 'monitor-list'
    | 'incident-feed'
    | 'certificate-expiry'
    | 'sla-table'
    | 'incident-history'
    | 'reliability-kpis'
    | 'maintenance-schedule'
    | 'heading'

export type WidgetWidth = 'quarter' | 'third' | 'half' | 'twoThirds' | 'full'

export type WidgetHeight = 'slim' | 'compact' | 'standard' | 'tall'

/** Order a monitor list arranges its rows in. */
export type WidgetSort = 'name' | 'status' | 'uptime' | 'latency'

export interface WidgetConfig {
  /** Overrides the auto-generated widget title. */
  title?: string
  /** Time range used by data driven widgets. */
  range?: StatsRange
  /** Heading widgets only. */
  level?: 1 | 2 | 3
  /**
   * Monitor ids an aggregate widget is limited to. Empty means "all monitors",
   * and `groupId` takes precedence when both are set.
   */
  monitorIds?: number[]
  /** Group whose subtree an aggregate widget covers, or null for no group scope. */
  groupId?: number | null
  /** Rows rendered by list widgets. */
  limit?: number
  /** Uptime an SLA table measures against, as a ratio between 0 and 1. */
  target?: number
  /** Order used by monitor lists. */
  sort?: WidgetSort
  /**
   * How a latency chart is drawn, or `inherit` to follow whatever the reader
   * has set for themselves. A dashboard is composed once and read by
   * everybody, so a widget may insist on a look — but does not have to.
   */
  style?: LatencyChartStyle | 'inherit'
}

export interface DashboardWidget {
  id: number
  dashboardId: number
  type: WidgetType
  monitorId: number | null
  config: WidgetConfig
  position: number
  width: WidgetWidth
  height: WidgetHeight
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
