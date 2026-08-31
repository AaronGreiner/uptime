import type { NavigationMenuItem } from '@nuxt/ui'
import type { MonitorTreeNode } from '#shared/types/group'
import type { MonitorStatus, MonitorWithState } from '#shared/types/monitor'
import { monitorGroupIcon } from '#shared/utils/group'

/** One row of the monitoring tree, a group or a monitor. */
export interface MonitorNavEntry {
  /** Unique within the tree. Identifies the active row and keys the list. */
  key: string
  label: string
  icon: string
  to: string
  /** Status dot drawn onto the icon. Monitors only, groups carry a badge. */
  status?: MonitorStatus
  badge?: { label: string, color: 'error' | 'warning' | 'neutral', variant: 'subtle' | 'outline' }
  /** Set on groups, so the row knows what to fold. */
  groupId?: number
  /** Subgroups first, then the monitors of the group itself. */
  children: MonitorNavEntry[]
  /** Whether the branch is currently folded open. */
  expanded: boolean
  /** True on the single row matching the current route. */
  active: boolean
}

/**
 * Builds the monitoring section of the sidebar and owns the fold state of the
 * tree. Exactly one row is ever marked as active, and the path down to it is
 * folded open so the current location cannot hide inside a closed branch.
 */
export function useMonitorNavigation() {
  const { t } = useI18n()
  const route = useRoute()
  const { tree, monitors, rootMonitors, flatTree, byId } = useMonitorTree()

  /*
   * Collapsed rather than expanded ids: a group nobody has touched starts open,
   * and so does a group created later. "Expand all" is therefore an empty list.
   */
  const collapsedIds = useUiPreference<number[]>(
    'nav-collapsed',
    () => [],
    value => Array.isArray(value) && value.every(entry => typeof entry === 'number')
  )

  /** The row matching the current route, or null outside the monitoring pages. */
  const activeKey = computed<string | null>(() => {
    const monitorId = route.path.match(/^\/monitors\/(\d+)$/)?.[1]

    if (monitorId) {
      return `monitor-${monitorId}`
    }

    // `none` filters the list down to the ungrouped monitors, which the tree
    // shows at its root rather than as a row of its own.
    if (route.path !== '/monitors' || route.query.group === 'none') {
      return null
    }

    const groupId = Number(route.query.group)

    return Number.isInteger(groupId) && byId.value.has(groupId) ? `group-${groupId}` : 'all'
  })

  /** Groups that have to be open for the active row to be visible. */
  const revealedIds = computed<number[]>(() => {
    const key = activeKey.value

    if (!key) {
      return []
    }

    const monitorId = key.startsWith('monitor-') ? Number(key.slice('monitor-'.length)) : null
    const activeGroupId = key.startsWith('group-') ? Number(key.slice('group-'.length)) : null

    // A monitor needs its own group open, a group only the ones above it.
    const start = monitorId !== null
      ? monitors.value.find(monitor => monitor.id === monitorId)?.groupId ?? null
      : activeGroupId !== null ? byId.value.get(activeGroupId)?.parentId ?? null : null

    const ids: number[] = []

    for (let node = start === null ? undefined : byId.value.get(start); node;) {
      ids.push(node.id)
      node = node.parentId === null ? undefined : byId.value.get(node.parentId)
    }

    return ids
  })

  /*
   * Groups the reader folded shut by hand although they hold the active row.
   * Revealing has to stay a derived value so the server renders the same tree
   * the browser does, and this is what keeps it from overruling a deliberate
   * fold. It lasts until the active row moves on.
   */
  const forcedShutIds = ref<number[]>([])

  watch(activeKey, () => {
    forcedShutIds.value = []
  })

  /** The groups that are folded shut right now, revealing already applied. */
  const shutIds = computed(() => {
    const revealed = revealedIds.value.filter(id => !forcedShutIds.value.includes(id))

    return collapsedIds.value.filter(id => !revealed.includes(id))
  })

  /** Writes both lists at once; they only ever disagree about a revealed group. */
  function setShut(ids: number[]) {
    collapsedIds.value = ids
    forcedShutIds.value = ids
  }

  /**
   * A group shows the number of monitors below it, or the number of failing
   * ones when something is wrong, so a folded branch still reports trouble.
   */
  function groupBadge(node: MonitorTreeNode): MonitorNavEntry['badge'] {
    const { total, down, pending } = node.totals

    if (down > 0) {
      return { label: String(down), color: 'error', variant: 'subtle' }
    }

    if (pending > 0) {
      return { label: String(pending), color: 'warning', variant: 'subtle' }
    }

    return total > 0 ? { label: String(total), color: 'neutral', variant: 'subtle' } : undefined
  }

  function monitorEntry(monitor: MonitorWithState): MonitorNavEntry {
    return {
      key: `monitor-${monitor.id}`,
      label: monitor.name,
      icon: monitorIcon(monitor),
      status: monitor.state.status,
      to: `/monitors/${monitor.id}`,
      children: [],
      expanded: false,
      active: activeKey.value === `monitor-${monitor.id}`
    }
  }

  function groupEntry(node: MonitorTreeNode): MonitorNavEntry {
    return {
      key: `group-${node.id}`,
      label: node.name,
      icon: monitorGroupIcon(node),
      badge: groupBadge(node),
      groupId: node.id,
      // Clicking the label opens the filtered list, the chevron folds the branch.
      to: `/monitors?group=${node.id}`,
      children: [...node.children.map(groupEntry), ...node.monitors.map(monitorEntry)],
      expanded: !shutIds.value.includes(node.id),
      active: activeKey.value === `group-${node.id}`
    }
  }

  const entries = computed<MonitorNavEntry[]>(() => [
    {
      key: 'all',
      label: t('monitor.allMonitors'),
      icon: 'i-lucide-activity',
      to: '/monitors',
      badge: monitors.value.length
        ? { label: String(monitors.value.length), color: 'neutral', variant: 'outline' }
        : undefined,
      children: [],
      expanded: false,
      active: activeKey.value === 'all'
    },
    ...tree.value.map(groupEntry),
    ...rootMonitors.value.map(monitorEntry)
  ])

  /** Groups that hold anything; the others have nothing to fold. */
  const foldableIds = computed(() => flatTree.value
    .filter(node => node.children.length > 0 || node.monitors.length > 0)
    .map(node => node.id))

  const hasFoldableGroups = computed(() => foldableIds.value.length > 0)

  /** With nothing left to fold shut, the one fold button offers the opposite. */
  const allCollapsed = computed(() => foldableIds.value.every(id => shutIds.value.includes(id)))

  function toggle(groupId: number) {
    setShut(shutIds.value.includes(groupId)
      ? shutIds.value.filter(id => id !== groupId)
      : [...shutIds.value, groupId])
  }

  function toggleAll() {
    setShut(allCollapsed.value ? [] : foldableIds.value)
  }

  /**
   * The same tree as `NavigationMenuItem`s, used while the sidebar is collapsed
   * to icons. That mode replaces the fold with a popover, so it needs no state.
   */
  const collapsedItems = computed<NavigationMenuItem[]>(() => {
    const toItem = (entry: MonitorNavEntry): NavigationMenuItem => ({
      label: entry.label,
      icon: entry.icon,
      to: entry.to,
      active: entry.active,
      ...(entry.status ? { chip: { color: monitorStatusColor(entry.status), inset: true } } : {}),
      ...(entry.children.length ? { children: entry.children.map(toItem) } : {})
    })

    return entries.value.map(toItem)
  })

  return { entries, collapsedItems, hasFoldableGroups, allCollapsed, toggle, toggleAll }
}
