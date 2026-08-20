import type { NavigationMenuItem } from '@nuxt/ui'
import type { MonitorTreeNode } from '#shared/types/group'
import type { MonitorWithState } from '#shared/types/monitor'
import { monitorGroupIcon } from '#shared/utils/group'

/**
 * Builds the monitoring section of the sidebar: a link to the full list,
 * followed by the group tree. `UNavigationMenu` nests `children` to any depth in
 * its vertical orientation, so the tree maps onto it one to one.
 */
export function useMonitorNavigation() {
  const { t } = useI18n()
  const { tree, monitors, rootMonitors } = useMonitorTree()

  function monitorItem(monitor: MonitorWithState): NavigationMenuItem {
    return {
      label: monitor.name,
      icon: monitorTypeIcon(monitor.type),
      // The chip turns the type icon into a status dot without costing a column.
      chip: { color: monitorStatusColor(monitor.state.status), inset: true },
      to: `/monitors/${monitor.id}`
    }
  }

  /**
   * A group shows the number of monitors below it, or the number of failing
   * ones when something is wrong, so a collapsed branch still reports trouble.
   */
  function groupBadge(node: MonitorTreeNode): NavigationMenuItem['badge'] {
    const { total, down, pending } = node.totals

    if (down > 0) {
      return { label: String(down), color: 'error', variant: 'subtle' }
    }

    if (pending > 0) {
      return { label: String(pending), color: 'warning', variant: 'subtle' }
    }

    return total > 0 ? { label: String(total), color: 'neutral', variant: 'subtle' } : undefined
  }

  function groupItem(node: MonitorTreeNode): NavigationMenuItem {
    const children = [...node.children.map(groupItem), ...node.monitors.map(monitorItem)]

    return {
      label: node.name,
      icon: monitorGroupIcon(node),
      badge: groupBadge(node),
      // Clicking the label opens the filtered list, the chevron folds the branch.
      to: `/monitors?group=${node.id}`,
      defaultOpen: true,
      ...(children.length ? { children } : {})
    }
  }

  const items = computed<NavigationMenuItem[]>(() => [
    {
      label: t('monitor.allMonitors'),
      icon: 'i-lucide-activity',
      to: '/monitors',
      // Without this every monitor route would light the entry up as well.
      exact: true,
      badge: monitors.value.length || undefined
    },
    ...tree.value.map(groupItem),
    ...rootMonitors.value.map(monitorItem)
  ])

  return { items }
}
