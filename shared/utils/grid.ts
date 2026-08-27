import type { WidgetHeight, WidgetWidth } from '../types/dashboard'

/** Ordered from narrowest to widest; the resize controls step through this order. */
export const WIDGET_WIDTHS = ['quarter', 'third', 'half', 'twoThirds', 'full'] as const

/** Ordered from shortest to tallest; the resize controls step through this order. */
export const WIDGET_HEIGHTS = ['slim', 'compact', 'standard', 'tall'] as const

/** Columns of the grid on the widest breakpoint, which the widths divide up. */
export const WIDGET_GRID_COLUMNS = 12

/**
 * Keep every responsive class in one literal string. Tailwind cannot emit class
 * names assembled from fragments at runtime.
 */
export const WIDGET_WIDTH_CLASS: Record<WidgetWidth, string> = {
  quarter: 'col-span-1 sm:col-span-3 lg:col-span-3',
  third: 'col-span-2 sm:col-span-3 lg:col-span-4',
  half: 'col-span-2 sm:col-span-6 lg:col-span-6',
  twoThirds: 'col-span-2 sm:col-span-6 lg:col-span-8',
  full: 'col-span-2 sm:col-span-6 lg:col-span-12'
}

export const WIDGET_HEIGHT_CLASS: Record<WidgetHeight, string> = {
  slim: 'row-span-1',
  compact: 'row-span-2',
  standard: 'row-span-3',
  tall: 'row-span-5'
}

/**
 * The same spans once more as numbers. The class maps above cannot be read back,
 * because their strings have to stay literal for Tailwind, and the preview needs
 * to know how large a cell actually becomes.
 */
export const WIDGET_WIDTH_COLUMNS: Record<WidgetWidth, number> = {
  quarter: 3,
  third: 4,
  half: 6,
  twoThirds: 8,
  full: 12
}

export const WIDGET_HEIGHT_ROWS: Record<WidgetHeight, number> = {
  slim: 1,
  compact: 2,
  standard: 3,
  tall: 5
}

/** Row height and gap of the grid on the widest breakpoint, in pixels. */
export const WIDGET_ROW_HEIGHT_PX = 60
export const WIDGET_GAP_PX = 16

export function widgetPixelHeight(height: WidgetHeight): number {
  const rows = WIDGET_HEIGHT_ROWS[height]

  return rows * WIDGET_ROW_HEIGHT_PX + (rows - 1) * WIDGET_GAP_PX
}

/** Width a cell occupies inside a grid of the given total width, in pixels. */
export function widgetPixelWidth(width: WidgetWidth, gridWidth: number): number {
  const columns = WIDGET_WIDTH_COLUMNS[width]
  const columnWidth = (gridWidth - (WIDGET_GRID_COLUMNS - 1) * WIDGET_GAP_PX) / WIDGET_GRID_COLUMNS

  return columns * columnWidth + (columns - 1) * WIDGET_GAP_PX
}

/**
 * Geometry of an uptime calendar square, in pixels. Fixed like the pulse bar,
 * so a week is the same block wherever it is drawn and the cell decides how many
 * weeks it holds. The literal classes exist because Tailwind cannot emit sizes
 * assembled at runtime; keep them in step with the pitch.
 */
export const CALENDAR_SQUARE_PITCH_PX = 14
export const CALENDAR_SQUARE_CLASS = 'size-[11px]'
export const CALENDAR_GRID_CLASS = 'gap-[3px]'

/** Padding a widget card takes off its own width, both sides together. */
const CARD_PADDING_PX = 40

/**
 * Days a calendar of this width can show, rounded to whole weeks.
 *
 * Derived from the width token rather than measured, because the request has to
 * be the same on the server and in the browser. The grid then clips whatever
 * does not fit the real cell, so asking for a little too much is free while
 * asking for too little would leave a gap nothing can fill.
 */
export function calendarDaysForWidth(width: WidgetWidth, maxDays: number): number {
  const inner = widgetPixelWidth(width, 1180) - CARD_PADDING_PX
  const columns = Math.floor((inner + WIDGET_GAP_PX) / CALENDAR_SQUARE_PITCH_PX)

  return Math.min(maxDays, Math.max(4, columns) * 7)
}
