import type { MonitorGroup, MonitorTreeNode } from '#shared/types/group'
import type { MonitorWithState } from '#shared/types/monitor'
import { buildMonitorTree, flattenMonitorGroupTree, joinMonitorPath, monitorTotals, ungroupedMonitors } from '#shared/utils/group'

/** Shared group list. Like the monitors, every caller reuses one cache entry. */
export function useMonitorGroups() {
  return useAsyncData<MonitorGroup[]>('monitor-groups', () => $fetch('/api/groups'), {
    default: () => []
  })
}

/**
 * The group tree with the monitors attached and the status counts rolled up.
 * Built from the two shared caches, so it stays in sync with the polling loop
 * without issuing a request of its own.
 */
export function useMonitorTree() {
  const { data: groups, refresh: refreshGroups } = useMonitorGroups()
  const { data: monitors } = useMonitors()

  const tree = computed<MonitorTreeNode[]>(() => buildMonitorTree(groups.value, monitors.value))

  /** Depth first, which is the order the management list renders in. */
  const flatTree = computed(() => flattenMonitorGroupTree(tree.value))

  const rootMonitors = computed(() => ungroupedMonitors(monitors.value))
  const rootTotals = computed(() => monitorTotals(rootMonitors.value))

  const byId = computed(() => new Map(flatTree.value.map(node => [node.id, node])))

  /** A group plus everything nested below it, used by the group filter. */
  function monitorsInSubtree(groupId: number): MonitorWithState[] {
    const node = byId.value.get(groupId)

    if (!node) {
      return []
    }

    const collect = (current: MonitorTreeNode): MonitorWithState[] => [
      ...current.monitors,
      ...current.children.flatMap(collect)
    ]

    return collect(node)
  }

  return { groups, monitors, tree, flatTree, byId, rootMonitors, rootTotals, monitorsInSubtree, refreshGroups }
}

/** Admin mutations shared by the sidebar, the list page and the form modal. */
export function useMonitorGroupActions(onChanged: () => unknown) {
  const { t } = useI18n()
  const toast = useToast()
  const { byId } = useMonitorTree()
  const pending = ref<number | null>(null)

  async function move(group: MonitorGroup, direction: 'up' | 'down') {
    pending.value = group.id

    try {
      await $fetch(`/api/groups/${group.id}/move`, { method: 'POST', body: { direction } })
      await onChanged()
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
    } finally {
      pending.value = null
    }
  }

  async function remove(group: MonitorGroup) {
    pending.value = group.id

    const path = joinMonitorPath(byId.value.get(group.id)?.path ?? [group.name])

    try {
      await $fetch(`/api/groups/${group.id}`, { method: 'DELETE' })
      await onChanged()

      // Read before the reload, which is what drops the group from the tree.
      toast.add({ title: t('group.deleted', { name: path }), color: 'success', icon: 'i-lucide-check' })

      return true
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })

      return false
    } finally {
      pending.value = null
    }
  }

  return { pending, move, remove }
}
