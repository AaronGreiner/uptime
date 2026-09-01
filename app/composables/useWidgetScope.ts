import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorStatus, MonitorWithState } from '#shared/types/monitor'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

/** Worst first, so a list sorted by status opens with what needs attention. */
const STATUS_ORDER: Record<MonitorStatus, number> = { down: 0, pending: 1, up: 2, maintenance: 3, paused: 4 }

/**
 * The monitors an aggregate widget covers.
 *
 * A group scope follows the tree, so a monitor moved into the group joins the
 * widget on its own; an explicit list of ids is the escape hatch for a selection
 * that has no group. Neither means every monitor.
 */
export function useWidgetScope(widget: MaybeRefOrGetter<DashboardWidget>) {
  const { data: monitors } = useMonitors()
  const { monitorsInSubtree, byId } = useMonitorTree()

  const scoped = computed<MonitorWithState[]>(() => {
    const { config } = toValue(widget)

    if (config.groupId && byId.value.has(config.groupId)) {
      return monitorsInSubtree(config.groupId)
    }

    const ids = config.monitorIds

    return ids?.length ? monitors.value.filter(monitor => ids.includes(monitor.id)) : monitors.value
  })

  /**
   * True while the widget covers everything. The endpoints read a missing id
   * list as "all monitors", which keeps the query out of the id cap and keeps
   * its cache key from churning every time a monitor is added.
   */
  const isAll = computed(() => {
    const { config } = toValue(widget)

    return !(config.groupId && byId.value.has(config.groupId)) && !config.monitorIds?.length
  })

  /** Ids in a stable order, so they can key a request without churning it. */
  const scopedIds = computed(() => scoped.value.map(monitor => monitor.id).sort((a, b) => a - b))

  return { scoped, scopedIds, isAll }
}

/** Rows of a monitor list, in the order the widget asks for. */
export function sortMonitors(monitors: MonitorWithState[], sort = WIDGET_CONFIG_DEFAULTS.sort): MonitorWithState[] {
  // The scope already arrives in tree order, which is the order the sidebar,
  // the list page and the group headings all show. Keeping it is the option.
  if (sort === 'tree') {
    return [...monitors]
  }

  const byName = (a: MonitorWithState, b: MonitorWithState) => a.name.localeCompare(b.name)

  return [...monitors].sort((a, b) => {
    switch (sort) {
      case 'status':
        return STATUS_ORDER[a.state.status] - STATUS_ORDER[b.state.status] || byName(a, b)
      case 'uptime':
        return (a.uptime24h.ratio ?? 1) - (b.uptime24h.ratio ?? 1) || byName(a, b)
      case 'latency':
        return (b.state.latencyMs ?? -1) - (a.state.latencyMs ?? -1) || byName(a, b)
      case 'name':
        return byName(a, b)
    }
  })
}
