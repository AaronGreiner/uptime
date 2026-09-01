import type { Monitor, MonitorWithState } from '#shared/types/monitor'

/**
 * Which of the actions is running, next to the monitor it runs on.
 *
 * The list needs no more than the id, since one menu button stands for all of
 * them. The detail page draws `checkNow` as a button beside that menu, so it
 * has to tell the two apart — otherwise a check spins both at once.
 */
export type MonitorActionName = 'check' | 'toggle' | 'maintenance' | 'delete'

/** Shared admin actions used by the monitor list and the detail page. */
export function useMonitorActions(onChanged: () => unknown) {
  const { t } = useI18n()
  const toast = useToast()
  const { monitorPath } = useMonitorPath()
  const pending = ref<number | null>(null)
  const pendingAction = ref<MonitorActionName | null>(null)
  const succeededId = ref<number | null>(null)
  let succeededTimer: ReturnType<typeof setTimeout> | undefined

  onScopeDispose(() => clearTimeout(succeededTimer))

  async function checkNow(monitor: Monitor) {
    clearTimeout(succeededTimer)
    succeededId.value = null
    pending.value = monitor.id
    pendingAction.value = 'check'

    try {
      await $fetch<MonitorWithState>(`/api/monitors/${monitor.id}/check`, { method: 'POST' })
      await onChanged()

      succeededId.value = monitor.id
      succeededTimer = setTimeout(() => {
        if (succeededId.value === monitor.id) {
          succeededId.value = null
        }
      }, 1200)

      toast.add({ title: t('monitor.actions.checked'), color: 'success', icon: 'i-lucide-check' })
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
    } finally {
      pending.value = null
      pendingAction.value = null
    }
  }

  async function toggleActive(monitor: Monitor) {
    pending.value = monitor.id
    pendingAction.value = 'toggle'

    try {
      await $fetch(`/api/monitors/${monitor.id}`, {
        method: 'PATCH',
        body: { ...toMonitorInput(monitor), active: !monitor.active }
      })

      await onChanged()
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
    } finally {
      pending.value = null
      pendingAction.value = null
    }
  }

  /**
   * Flips the manual maintenance switch. `durationSeconds` of null is the open
   * ended case; the endpoint answers with the monitor, so the caller's reload
   * is what puts the new state on screen rather than an optimistic guess.
   */
  async function setMaintenance(monitor: Monitor, durationSeconds: number | null) {
    pending.value = monitor.id
    pendingAction.value = 'maintenance'

    try {
      await $fetch(`/api/monitors/${monitor.id}/maintenance`, {
        method: 'POST',
        body: { durationSeconds }
      })

      await onChanged()

      toast.add({
        title: t('maintenance.manual.started', { name: monitorPath(monitor) }),
        color: 'info',
        icon: 'i-lucide-wrench'
      })
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
    } finally {
      pending.value = null
      pendingAction.value = null
    }
  }

  async function endMaintenance(monitor: Monitor) {
    pending.value = monitor.id
    pendingAction.value = 'maintenance'

    try {
      await $fetch(`/api/monitors/${monitor.id}/maintenance`, { method: 'DELETE' })
      await onChanged()

      toast.add({
        title: t('maintenance.manual.ended', { name: monitorPath(monitor) }),
        color: 'success',
        icon: 'i-lucide-check'
      })
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
    } finally {
      pending.value = null
      pendingAction.value = null
    }
  }

  async function remove(monitor: Monitor) {
    pending.value = monitor.id
    pendingAction.value = 'delete'

    try {
      await $fetch(`/api/monitors/${monitor.id}`, { method: 'DELETE' })
      await onChanged()

      toast.add({ title: t('monitor.deleted', { name: monitorPath(monitor) }), color: 'success', icon: 'i-lucide-check' })

      return true
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })

      return false
    } finally {
      pending.value = null
      pendingAction.value = null
    }
  }

  return { pending, pendingAction, succeededId, checkNow, toggleActive, setMaintenance, endMaintenance, remove }
}
