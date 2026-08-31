import type {
  WidgetConfig,
  WidgetHeight,
  WidgetSort,
  WidgetType,
  WidgetWidth
} from '../types/dashboard'
import { WIDGET_HEIGHTS, WIDGET_WIDTHS } from './grid'

/**
 * A configurable aspect of a widget. The registry below lists the fields each
 * type uses, and that one list drives the form, the persisted config and the
 * validation — so a widget can never be saved with settings it does not read.
 */
export type WidgetField
  = | 'monitor'
    | 'scope'
    | 'range'
    | 'level'
    | 'target'
    | 'sort'
    | 'style'

export interface WidgetDefinition {
  /** Shown next to the type in the picker. Also listed in `nuxt.config`. */
  icon: string
  fields: readonly WidgetField[]
  widths: readonly WidgetWidth[]
  heights: readonly WidgetHeight[]
  defaultWidth: WidgetWidth
  defaultHeight: WidgetHeight
  /** Overrides WIDGET_CONFIG_DEFAULTS where the type wants something else. */
  defaults?: Partial<WidgetConfig>
}

/** Selectable SLA targets, as ratios. */
export const WIDGET_SLA_TARGETS = [0.99, 0.995, 0.999, 0.9995, 0.9999] as const

export const WIDGET_SORTS = ['status', 'name', 'uptime', 'latency'] as const satisfies readonly WidgetSort[]

/**
 * Everything the application knows about a widget type, in one place. Adding a
 * type means extending the `WidgetType` union, adding an entry here, adding the
 * component to `DashboardWidgetBody` and adding the labels to both locale files.
 *
 * The insertion order is the order the picker offers them in.
 */
export const WIDGET_DEFINITIONS = {
  'monitor': {
    icon: 'i-lucide-square-activity',
    fields: ['monitor'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'third',
    defaultHeight: 'standard'
  },
  'uptime-summary': {
    icon: 'i-lucide-percent',
    fields: ['monitor', 'range'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'quarter',
    defaultHeight: 'compact'
  },
  'latency-chart': {
    icon: 'i-lucide-chart-line',
    fields: ['monitor', 'range', 'style'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'uptime-calendar': {
    icon: 'i-lucide-calendar-days',
    fields: ['monitor'],
    widths: WIDGET_WIDTHS,
    // Seven rows of fixed size squares need more than a compact cell can give.
    heights: ['standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'status-overview': {
    icon: 'i-lucide-layout-grid',
    fields: ['scope'],
    widths: ['third', 'half', 'twoThirds', 'full'],
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'full',
    defaultHeight: 'compact'
  },
  'monitor-list': {
    icon: 'i-lucide-list',
    fields: ['scope', 'sort'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'incident-feed': {
    icon: 'i-lucide-siren',
    fields: ['scope'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'certificate-expiry': {
    icon: 'i-lucide-shield-check',
    fields: ['scope'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'sla-table': {
    icon: 'i-lucide-target',
    fields: ['scope', 'range', 'target'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'full',
    defaultHeight: 'standard',
    // A day of uptime says nothing about a target; a month is what is reported.
    defaults: { range: '30d' }
  },
  'incident-history': {
    icon: 'i-lucide-history',
    fields: ['scope', 'range'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard',
    defaults: { range: '30d' }
  },
  'reliability-kpis': {
    icon: 'i-lucide-gauge',
    fields: ['scope', 'range'],
    widths: ['third', 'half', 'twoThirds', 'full'],
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'full',
    defaultHeight: 'compact',
    defaults: { range: '30d' }
  },
  'maintenance-schedule': {
    icon: 'i-lucide-wrench',
    fields: ['scope'],
    widths: WIDGET_WIDTHS,
    heights: ['compact', 'standard', 'tall'],
    defaultWidth: 'half',
    defaultHeight: 'standard'
  },
  'heading': {
    icon: 'i-lucide-type',
    fields: ['level'],
    widths: WIDGET_WIDTHS,
    heights: ['slim'],
    defaultWidth: 'full',
    defaultHeight: 'slim'
  }
} as const satisfies Record<WidgetType, WidgetDefinition>

/**
 * Derived rather than written out a second time, so a type that has a definition
 * is always offered and always accepted. Object key order is insertion order.
 */
export const WIDGET_TYPES = Object.keys(WIDGET_DEFINITIONS) as [WidgetType, ...WidgetType[]]

export function widgetDefinition(type: WidgetType): WidgetDefinition {
  return WIDGET_DEFINITIONS[type]
}

export function widgetHasField(type: WidgetType, field: WidgetField): boolean {
  return (WIDGET_DEFINITIONS[type].fields as readonly WidgetField[]).includes(field)
}

/** Values a field falls back to while the widget carries none of its own. */
export const WIDGET_CONFIG_DEFAULTS: Omit<Required<WidgetConfig>, 'title'> = {
  range: '24h',
  level: 2,
  target: 0.999,
  sort: 'status',
  style: 'inherit',
  monitorIds: [],
  groupId: null
}

/** The defaults in force for a type: the global ones with its own on top. */
export function widgetConfigDefaults(type: WidgetType): Omit<Required<WidgetConfig>, 'title'> {
  return { ...WIDGET_CONFIG_DEFAULTS, ...(WIDGET_DEFINITIONS[type] as WidgetDefinition).defaults }
}

/**
 * Reduces a config to the settings the type actually reads, filling in the
 * defaults for the rest. Both the form and the write endpoints run it, which is
 * what makes the registry binding: a stored config never carries leftovers from
 * a type the widget was changed away from, and a setting the form happens to
 * have no field for is carried through an edit instead of being dropped.
 */
export function widgetConfigForType(type: WidgetType, config: WidgetConfig = {}): WidgetConfig {
  const result: WidgetConfig = {}
  const fallback = widgetConfigDefaults(type)
  const title = config.title?.trim()

  if (title) {
    result.title = title
  }

  for (const field of WIDGET_DEFINITIONS[type].fields as readonly WidgetField[]) {
    switch (field) {
      // The monitor is a column of its own, not part of the config.
      case 'monitor':
        break
      case 'scope':
        result.monitorIds = config.monitorIds ?? fallback.monitorIds
        result.groupId = config.groupId ?? fallback.groupId
        break
      case 'range':
        result.range = config.range ?? fallback.range
        break
      case 'level':
        result.level = config.level ?? fallback.level
        break
      case 'target':
        result.target = config.target ?? fallback.target
        break
      case 'sort':
        result.sort = config.sort ?? fallback.sort
        break
      case 'style':
        result.style = config.style ?? fallback.style
        break
    }
  }

  return result
}

export function widgetNeedsMonitor(type: WidgetType): boolean {
  return widgetHasField(type, 'monitor')
}

export function clampWidgetSize(
  type: WidgetType,
  width?: WidgetWidth | null,
  height?: WidgetHeight | null
): { width: WidgetWidth, height: WidgetHeight } {
  const definition = WIDGET_DEFINITIONS[type] as WidgetDefinition

  return {
    width: width && definition.widths.includes(width) ? width : definition.defaultWidth,
    height: height && definition.heights.includes(height) ? height : definition.defaultHeight
  }
}

export function stepWidgetWidth(type: WidgetType, width: WidgetWidth, direction: -1 | 1): WidgetWidth | null {
  return stepSize(WIDGET_DEFINITIONS[type].widths, width, direction)
}

export function stepWidgetHeight(type: WidgetType, height: WidgetHeight, direction: -1 | 1): WidgetHeight | null {
  return stepSize(WIDGET_DEFINITIONS[type].heights, height, direction)
}

function stepSize<T extends string>(allowed: readonly T[], value: T, direction: -1 | 1): T | null {
  const current = allowed.indexOf(value)
  const next = current + direction

  return current >= 0 && next >= 0 && next < allowed.length ? allowed[next]! : null
}

/** Widths of a type in the global narrow-to-wide order, for the size picker. */
export function widgetWidthOptions(type: WidgetType): WidgetWidth[] {
  return WIDGET_WIDTHS.filter(width => (WIDGET_DEFINITIONS[type].widths as readonly WidgetWidth[]).includes(width))
}

export function widgetHeightOptions(type: WidgetType): WidgetHeight[] {
  return WIDGET_HEIGHTS.filter(height => (WIDGET_DEFINITIONS[type].heights as readonly WidgetHeight[]).includes(height))
}
