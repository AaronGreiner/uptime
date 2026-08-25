import type { NotificationAssignment } from '#shared/types/monitor'
import type { NotificationChannel, NotificationDelivery, NotificationGroup } from '#shared/types/notification'
import { resolveAssignedGroupIds } from '#shared/utils/notification'

/**
 * Channels, groups and the delivery log. All three endpoints require an admin
 * session — unlike the rest of the read API, because a channel holds credentials
 * — so these are only ever called from admin screens and dialogs.
 */
export function useNotificationChannels() {
  return useAsyncData<NotificationChannel[]>('notification-channels', () => $fetch('/api/notifications/channels'), {
    default: () => []
  })
}

export function useNotificationGroups() {
  return useAsyncData<NotificationGroup[]>('notification-groups', () => $fetch('/api/notifications/groups'), {
    default: () => []
  })
}

export function useNotificationDeliveries() {
  return useAsyncData<NotificationDelivery[]>('notification-deliveries', () => $fetch('/api/notifications/deliveries'), {
    default: () => []
  })
}

/**
 * The groups a record would inherit, walking up from the monitor group it sits
 * in. Uses `resolveAssignedGroupIds`, the same decision the scheduler makes, so
 * the dialog cannot drift away from what actually happens.
 *
 * @param startGroupId Monitor group to start the walk at: the one a monitor
 *   belongs to, or the parent of the group being edited.
 */
export function useInheritedNotificationGroups(startGroupId: MaybeRefOrGetter<number | null>) {
  const { data: notificationGroups } = useNotificationGroups()
  const { byId } = useMonitorTree()

  return computed<NotificationGroup[]>(() => {
    const chain: NotificationAssignment[] = []
    const seen = new Set<number>()
    let current = toValue(startGroupId)

    while (current !== null && !seen.has(current)) {
      seen.add(current)

      const node = byId.value.get(current)

      if (!node) {
        break
      }

      chain.push({ notificationMode: node.notificationMode, notificationGroupIds: node.notificationGroupIds })
      current = node.parentId
    }

    const decided = resolveAssignedGroupIds(chain)
    const ids = decided ?? notificationGroups.value.filter(group => group.isDefault).map(group => group.id)
    const byGroupId = new Map(notificationGroups.value.map(group => [group.id, group]))

    return ids
      .map(id => byGroupId.get(id))
      .filter((group): group is NotificationGroup => group !== undefined)
  })
}
