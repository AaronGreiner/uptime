import type {
  DashboardWidget,
  WidgetChild,
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
    | 'label'
    | 'scope'
    | 'range'
    | 'level'
    | 'target'
    | 'sort'
    | 'style'
    | 'children'

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

export const WIDGET_SORTS = ['tree', 'status', 'name', 'uptime', 'latency'] as const satisfies readonly WidgetSort[]

/**
 * The one widget that holds others. Its own width and height are never drawn:
 * the block is not a cell, it expands into the cells of its children.
 */
export const REPEAT_WIDGET_TYPE = 'monitor-repeat' as const

/** How many widgets one band may hold. A band is a row, not a dashboard. */
export const REPEAT_MAX_CHILDREN = 12

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
    fields: ['monitor', 'label'],
    widths: WIDGET_WIDTHS,
    // Seven rows of fixed size squares are taller than what a compact cell
    // leaves under a header, so there the label moves on top of the squares —
    // and can be turned off altogether.
    heights: ['compact', 'standard', 'tall'],
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
  },
  'monitor-repeat': {
    icon: 'i-lucide-repeat',
    fields: ['scope', 'sort', 'children'],
    // A block occupies whatever its children need. The single option exists
    // because every widget carries a size; nothing reads these two.
    widths: ['full'],
    heights: ['slim'],
    defaultWidth: 'full',
    defaultHeight: 'slim',
    // A band per monitor is read top to bottom, so the tree order the rest of
    // the application shows is the one that needs no explaining.
    defaults: { sort: 'tree' }
  }
} as const satisfies Record<WidgetType, WidgetDefinition>

/**
 * Derived rather than written out a second time, so a type that has a definition
 * is always offered and always accepted. Object key order is insertion order.
 */
export const WIDGET_TYPES = Object.keys(WIDGET_DEFINITIONS) as [WidgetType, ...WidgetType[]]

/** Everything a repeat block may hold, which is everything but another block. */
export const WIDGET_CHILD_TYPES = WIDGET_TYPES
  .filter(type => type !== REPEAT_WIDGET_TYPE) as [WidgetChild['type'], ...WidgetChild['type'][]]

export function widgetDefinition(type: WidgetType): WidgetDefinition {
  return WIDGET_DEFINITIONS[type]
}

export function widgetHasField(type: WidgetType, field: WidgetField): boolean {
  return (WIDGET_DEFINITIONS[type].fields as readonly WidgetField[]).includes(field)
}

/** Values a field falls back to while the widget carries none of its own. */
export const WIDGET_CONFIG_DEFAULTS: Omit<Required<WidgetConfig>, 'title'> = {
  showLabel: true,
  range: '24h',
  level: 2,
  target: 0.999,
  sort: 'status',
  style: 'inherit',
  monitorIds: [],
  groupId: null,
  children: []
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
      case 'label':
        result.showLabel = config.showLabel ?? fallback.showLabel
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
      case 'children':
        result.children = (config.children ?? fallback.children).flatMap(child => normalizeWidgetChild(child) ?? [])
        break
    }
  }

  return result
}

/**
 * A child as it comes out of the database, where nothing guarantees that it is
 * one: the config column is JSON, and an older row or a hand-written API call
 * may hold anything the registry has since stopped knowing.
 */
type StoredWidgetChild = {
  type: WidgetType
  config?: WidgetConfig
  width?: WidgetWidth
  height?: WidgetHeight
} | null | undefined

/**
 * A child reduced the same way the block holding it is: to the settings its own
 * type reads, at a size that type allows. Anything that is not a widget the
 * registry knows — a block nested into a block above all — is dropped rather
 * than stored, so the depth stays one without a check anywhere else.
 */
export function normalizeWidgetChild(child: StoredWidgetChild): WidgetChild | null {
  const type = child?.type

  if (!type || type === REPEAT_WIDGET_TYPE || !(type in WIDGET_DEFINITIONS)) {
    return null
  }

  const config = widgetConfigForType(type, child.config)

  // A child never reads a scope of its own: the block hands it one monitor per
  // band, overwriting both keys. Storing them would be a setting nothing reads.
  delete config.monitorIds
  delete config.groupId

  return {
    type,
    config,
    ...clampWidgetSize(type, child.width, child.height)
  }
}

/** The widgets a block draws per monitor, empty for every other type. */
export function widgetChildren(config: WidgetConfig): WidgetChild[] {
  return config.children ?? []
}

/**
 * One child of a block as the widget it is drawn as, for a single monitor.
 *
 * The monitor is pushed into both places a widget can carry one: `monitorId`
 * for the types bound to exactly one, and a scope of one for the aggregate
 * types. That is why no existing widget had to learn anything about blocks —
 * inside a band they simply find a scope with a single monitor in it.
 *
 * The block's own id is carried along because a child is not a row of its own.
 * Nothing reads it; the grid keys its cells by block, child and monitor.
 */
export function repeatChildWidget(block: DashboardWidget, child: WidgetChild, monitorId: number): DashboardWidget {
  return {
    ...block,
    type: child.type,
    monitorId,
    config: widgetHasField(child.type, 'scope')
      ? { ...child.config, monitorIds: [monitorId], groupId: null }
      : child.config,
    width: child.width,
    height: child.height
  }
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
