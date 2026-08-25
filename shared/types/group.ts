import type { MonitorStatus, MonitorWithState, NotificationAssignment } from './monitor'

/**
 * A node of the monitor tree. Groups nest into each other through `parentId`;
 * a null parent makes the group a root.
 */
export interface MonitorGroup extends NotificationAssignment {
  id: number
  name: string
  description: string | null
  /** Iconify name rendered in the tree, for example `i-lucide-server`. */
  icon: string | null
  parentId: number | null
  /** Manual order among siblings. Ties are broken by name. */
  position: number
  createdAt: number
  updatedAt: number
}

/** A group with its resolved subtree, as consumed by the navigation. */
export interface MonitorGroupNode extends MonitorGroup {
  /** Zero for a root group, incremented per level. */
  depth: number
  /** Names from the root down to and including this group. */
  path: string[]
  children: MonitorGroupNode[]
}

/** Status counts rolled up over a group and everything below it. */
export interface MonitorGroupTotals {
  total: number
  up: number
  down: number
  pending: number
  paused: number
  /** Worst status found in the subtree, or null when it holds no monitors. */
  status: MonitorStatus | null
}

/** A group node enriched with its own monitors and the rolled up totals. */
export interface MonitorTreeNode extends MonitorGroupNode {
  children: MonitorTreeNode[]
  /** Monitors assigned to this group itself, not to its descendants. */
  monitors: MonitorWithState[]
  totals: MonitorGroupTotals
}
