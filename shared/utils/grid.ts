import type { GridBreakpoint, WidgetLayout, WidgetPosition, WidgetType } from '../types/dashboard'

/** Ordered from largest to smallest, matching the grid component. */
export const GRID_BREAKPOINTS: GridBreakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs']

/** Minimum viewport width in pixels at which a breakpoint becomes active. */
export const GRID_BREAKPOINT_WIDTHS: Record<GridBreakpoint, number> = {
  lg: 1280,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0
}

/** Column count per breakpoint. */
export const GRID_COLUMNS: Record<GridBreakpoint, number> = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2
}

export const GRID_ROW_HEIGHT = 40
export const GRID_MARGIN: [number, number] = [16, 16]

/** Default footprint of a freshly added widget, expressed in `lg` columns. */
export const WIDGET_DEFAULT_SIZE: Record<WidgetType, { w: number, h: number, minW: number, minH: number }> = {
  'monitor': { w: 4, h: 4, minW: 2, minH: 3 },
  'uptime-summary': { w: 3, h: 3, minW: 2, minH: 2 },
  'latency-chart': { w: 6, h: 5, minW: 3, minH: 4 },
  'status-overview': { w: 12, h: 3, minW: 3, minH: 2 },
  'heading': { w: 12, h: 1, minW: 2, minH: 1 }
}

/** Below this breakpoint a widget always spans the full width of the grid. */
const STACKED_BREAKPOINTS: GridBreakpoint[] = ['xs', 'xxs']

/**
 * Scales a position defined for the `lg` breakpoint down to every other
 * breakpoint so a new widget has a sensible layout everywhere at once. Width and
 * column offset shrink proportionally, which keeps widgets side by side instead
 * of collapsing them into one column. On phone sized grids widgets go full width
 * instead, because a half column card is too narrow to read.
 */
export function buildDefaultWidgetLayout(type: WidgetType, x: number, y: number): WidgetLayout {
  const size = WIDGET_DEFAULT_SIZE[type]

  return GRID_BREAKPOINTS.reduce((layout, breakpoint) => {
    const columns = GRID_COLUMNS[breakpoint]
    const scale = columns / GRID_COLUMNS.lg
    const stacked = STACKED_BREAKPOINTS.includes(breakpoint)
    const width = stacked ? columns : Math.max(1, Math.min(columns, Math.round(size.w * scale)))

    layout[breakpoint] = {
      x: stacked ? 0 : Math.max(0, Math.min(columns - width, Math.round(x * scale))),
      y,
      w: width,
      h: stacked ? stackedHeight(type, size.h) : size.h
    }

    return layout
  }, {} as WidgetLayout)
}

/**
 * Narrow cards reflow their content into more rows, so the tallest widgets get
 * extra height on phone sized grids.
 */
function stackedHeight(type: WidgetType, height: number): number {
  return type === 'status-overview' ? height + 3 : height
}

/** Fills in missing breakpoints so a partially stored layout stays usable. */
export function normalizeWidgetLayout(type: WidgetType, layout: Partial<WidgetLayout> | null | undefined): WidgetLayout {
  const fallback = buildDefaultWidgetLayout(type, 0, 0)

  return GRID_BREAKPOINTS.reduce((result, breakpoint) => {
    const position = layout?.[breakpoint]

    result[breakpoint] = isWidgetPosition(position) ? position : fallback[breakpoint]

    return result
  }, {} as WidgetLayout)
}

function isWidgetPosition(value: unknown): value is WidgetPosition {
  if (!value || typeof value !== 'object') {
    return false
  }

  const position = value as Record<string, unknown>

  return ['x', 'y', 'w', 'h'].every(key => typeof position[key] === 'number' && Number.isFinite(position[key]))
}
