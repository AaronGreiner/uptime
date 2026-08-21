import type { WidgetHeight, WidgetType, WidgetWidth } from '../types/dashboard'

/** Ordered from narrowest to widest; the resize controls step through this order. */
export const WIDGET_WIDTHS = ['quarter', 'third', 'half', 'twoThirds', 'full'] as const

/** Ordered from shortest to tallest; the resize controls step through this order. */
export const WIDGET_HEIGHTS = ['slim', 'compact', 'standard', 'tall'] as const

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

interface WidgetSizeRule {
  widths: readonly WidgetWidth[]
  heights: readonly WidgetHeight[]
  defaultWidth: WidgetWidth
  defaultHeight: WidgetHeight
}

export const WIDGET_SIZE_RULES = {
  'monitor': {
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard'],
    defaultWidth: 'third',
    defaultHeight: 'standard'
  },
  'uptime-summary': {
    widths: ['quarter', 'third', 'half'],
    heights: ['compact', 'standard'],
    defaultWidth: 'quarter',
    defaultHeight: 'compact'
  },
  'latency-chart': {
    widths: ['half', 'twoThirds', 'full'],
    heights: ['standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'status-overview': {
    widths: ['half', 'twoThirds', 'full'],
    heights: ['compact', 'standard'],
    defaultWidth: 'full',
    defaultHeight: 'compact'
  },
  'heading': {
    widths: ['full'],
    heights: ['slim'],
    defaultWidth: 'full',
    defaultHeight: 'slim'
  }
} as const satisfies Record<WidgetType, WidgetSizeRule>

export function clampWidgetSize(
  type: WidgetType,
  width?: WidgetWidth | null,
  height?: WidgetHeight | null
): { width: WidgetWidth, height: WidgetHeight } {
  const rule: WidgetSizeRule = WIDGET_SIZE_RULES[type]

  return {
    width: width && rule.widths.includes(width) ? width : rule.defaultWidth,
    height: height && rule.heights.includes(height) ? height : rule.defaultHeight
  }
}

export function stepWidgetWidth(type: WidgetType, width: WidgetWidth, direction: -1 | 1): WidgetWidth | null {
  return stepSize(WIDGET_SIZE_RULES[type].widths, width, direction)
}

export function stepWidgetHeight(type: WidgetType, height: WidgetHeight, direction: -1 | 1): WidgetHeight | null {
  return stepSize(WIDGET_SIZE_RULES[type].heights, height, direction)
}

function stepSize<T extends string>(allowed: readonly T[], value: T, direction: -1 | 1): T | null {
  const current = allowed.indexOf(value)
  const next = current + direction

  return current >= 0 && next >= 0 && next < allowed.length ? allowed[next]! : null
}
