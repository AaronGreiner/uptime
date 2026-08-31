import type { MonitorGroup, MonitorGroupNode, MonitorGroupTotals, MonitorPathFormat, MonitorTreeNode } from '../types/group'
import type { MonitorStatus, MonitorWithState } from '../types/monitor'

/**
 * How deep the tree may nest, counting the root as level one. The limit keeps
 * the sidebar readable and bounds the recursive walks below.
 */
export const MONITOR_GROUP_MAX_DEPTH = 5

/** Icon offered in the group form. The first entry is the fallback. */
export const MONITOR_GROUP_ICONS = [
  'i-lucide-folder',
  'i-lucide-rocket',
  'i-lucide-server',
  'i-lucide-globe',
  'i-lucide-webhook',
  'i-lucide-database',
  'i-lucide-network',
  'i-lucide-shield',
  'i-lucide-book-open',
  'i-lucide-flask-conical',
  'i-lucide-puzzle',
  'i-lucide-cloud',
  'i-lucide-container',
  'i-lucide-cpu',
  'i-lucide-mail',
  'i-lucide-credit-card',
  'i-lucide-users',
  'i-lucide-building'
] as const

export const MONITOR_GROUP_FALLBACK_ICON = MONITOR_GROUP_ICONS[0]

const MONITOR_GROUP_ICON_SET = new Set<string>(MONITOR_GROUP_ICONS)

/**
 * Worst status first. A group reports the most severe state below it.
 *
 * Maintenance sits behind `up` on purpose: a node holding one monitor in a
 * window and a dozen healthy ones is a healthy node, and colouring it otherwise
 * would make a nightly reboot repaint half the sidebar. It only surfaces once
 * nothing below is being judged at all.
 */
const STATUS_SEVERITY: MonitorStatus[] = ['down', 'pending', 'up', 'maintenance', 'paused']

export function monitorGroupIcon(group: Pick<MonitorGroup, 'icon'> | null | undefined): string {
  return group?.icon && MONITOR_GROUP_ICON_SET.has(group.icon)
    ? group.icon
    : MONITOR_GROUP_FALLBACK_ICON
}

function compareGroups(a: MonitorGroup, b: MonitorGroup): number {
  return a.position - b.position || a.name.localeCompare(b.name) || a.id - b.id
}

/**
 * Turns the flat list into a tree. Rows whose parent is missing are treated as
 * roots, and a `parentId` cycle is broken by dropping the offending edge, so a
 * corrupted table can never produce infinite recursion here.
 */
export function buildMonitorGroupTree(groups: MonitorGroup[]): MonitorGroupNode[] {
  const byId = new Map(groups.map(group => [group.id, group]))
  const childrenOf = new Map<number | null, MonitorGroup[]>()

  for (const group of groups) {
    const parentId = group.parentId !== null && byId.has(group.parentId) ? group.parentId : null
    const siblings = childrenOf.get(parentId) ?? []

    siblings.push(group)
    childrenOf.set(parentId, siblings)
  }

  const visited = new Set<number>()

  const build = (parentId: number | null, depth: number, path: string[]): MonitorGroupNode[] => {
    if (depth >= MONITOR_GROUP_MAX_DEPTH) {
      return []
    }

    return [...(childrenOf.get(parentId) ?? [])]
      .sort(compareGroups)
      .filter(group => !visited.has(group.id))
      .map((group) => {
        visited.add(group.id)

        const groupPath = [...path, group.name]

        return { ...group, depth, path: groupPath, children: build(group.id, depth + 1, groupPath) }
      })
  }

  return build(null, 0, [])
}

/** Depth first walk, which is the order the management list renders in. */
export function flattenMonitorGroupTree<T extends MonitorGroupNode>(nodes: T[]): T[] {
  return nodes.flatMap(node => [node, ...flattenMonitorGroupTree(node.children as T[])])
}

/** Ids of a group and everything nested below it. */
export function monitorGroupSubtreeIds(node: MonitorGroupNode): number[] {
  return [node.id, ...node.children.flatMap(monitorGroupSubtreeIds)]
}

/**
 * Combines the group tree with the monitors, attaching each monitor to its
 * group and rolling the status counts up towards the roots.
 */
export function buildMonitorTree(groups: MonitorGroup[], monitors: MonitorWithState[]): MonitorTreeNode[] {
  const byGroup = new Map<number, MonitorWithState[]>()

  for (const monitor of monitors) {
    if (monitor.groupId === null) {
      continue
    }

    const list = byGroup.get(monitor.groupId) ?? []

    list.push(monitor)
    byGroup.set(monitor.groupId, list)
  }

  const decorate = (node: MonitorGroupNode): MonitorTreeNode => {
    const children = node.children.map(decorate)
    const own = byGroup.get(node.id) ?? []

    return {
      ...node,
      children,
      monitors: own,
      totals: mergeTotals([monitorTotals(own), ...children.map(child => child.totals)])
    }
  }

  return buildMonitorGroupTree(groups).map(decorate)
}

/** Monitors that are not assigned to any group. */
export function ungroupedMonitors(monitors: MonitorWithState[]): MonitorWithState[] {
  return monitors.filter(monitor => monitor.groupId === null)
}

export function monitorTotals(monitors: MonitorWithState[]): MonitorGroupTotals {
  const totals: MonitorGroupTotals = {
    total: 0, up: 0, down: 0, pending: 0, paused: 0, maintenance: 0, status: null
  }

  for (const monitor of monitors) {
    totals.total += 1
    totals[monitor.state.status] += 1
  }

  return { ...totals, status: worstStatus(totals) }
}

export function mergeTotals(list: MonitorGroupTotals[]): MonitorGroupTotals {
  const totals = list.reduce<MonitorGroupTotals>((sum, entry) => ({
    total: sum.total + entry.total,
    up: sum.up + entry.up,
    down: sum.down + entry.down,
    pending: sum.pending + entry.pending,
    paused: sum.paused + entry.paused,
    maintenance: sum.maintenance + entry.maintenance,
    status: null
  }), { total: 0, up: 0, down: 0, pending: 0, paused: 0, maintenance: 0, status: null })

  return { ...totals, status: worstStatus(totals) }
}

function worstStatus(totals: MonitorGroupTotals): MonitorStatus | null {
  return STATUS_SEVERITY.find(status => totals[status] > 0) ?? null
}

/**
 * Separator drawn between the segments of a breadcrumb. A monitor is only
 * identified by its name inside the tree that surrounds it; everywhere else two
 * groups may hold the same name, so the whole path has to be spelled out.
 */
export const MONITOR_PATH_SEPARATOR = '/'

/** Joins path segments into the breadcrumb the interface shows. */
export function joinMonitorPath(segments: string[]): string {
  return segments.join(` ${MONITOR_PATH_SEPARATOR} `)
}

/** Offered in the settings; the first entry is the default. */
export const MONITOR_PATH_FORMATS = ['full', 'parent', 'initials', 'name'] as const satisfies readonly MonitorPathFormat[]

export function isMonitorPathFormat(value: unknown): value is MonitorPathFormat {
  return MONITOR_PATH_FORMATS.includes(value as MonitorPathFormat)
}

/**
 * Cuts a group path down to the chosen format: `full` names every group above
 * the monitor, `parent` only the one it sits in, `initials` keeps the depth
 * visible without the wording, and `name` drops the path altogether.
 *
 * Only how a monitor is *named*. The group tree itself — the sidebar, the
 * section headings, the pickers — always spells its own path out, because
 * there the path is the thing being chosen rather than a label on something
 * else.
 */
export function shortenMonitorPath(segments: string[], format: MonitorPathFormat): string[] {
  switch (format) {
    case 'full':
      return segments
    case 'parent':
      return segments.slice(-1)
    case 'initials':
      // By code point, so a group named with an accent or an emoji keeps it
      // whole instead of losing half of a surrogate pair.
      return segments.map(segment => [...segment][0] ?? '')
    case 'name':
      return []
  }
}
