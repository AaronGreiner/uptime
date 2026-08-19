import type { Monitor, MonitorWithState } from '#shared/types/monitor'

/** Shared admin actions used by the monitor list and the detail page. */
export function useMonitorActions(onChanged: () => unknown) {
  const { t } = useI18n()
  const toast = useToast()
  const pending = ref<number | null>(null)

  async function checkNow(monitor: Monitor) {
    pending.value = monitor.id

    try {
      await $fetch<MonitorWithState>(`/api/monitors/${monitor.id}/check`, { method: 'POST' })
      await onChanged()

      toast.add({ title: t('monitor.actions.checked'), color: 'success', icon: 'i-lucide-check' })
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
    } finally {
      pending.value = null
    }
  }

  async function toggleActive(monitor: Monitor) {
    pending.value = monitor.id

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
    }
  }

  async function remove(monitor: Monitor) {
    pending.value = monitor.id

    try {
      await $fetch(`/api/monitors/${monitor.id}`, { method: 'DELETE' })
      await onChanged()

      toast.add({ title: t('monitor.deleted', { name: monitor.name }), color: 'success', icon: 'i-lucide-check' })

      return true
    } catch (error) {
      toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })

      return false
    } finally {
      pending.value = null
    }
  }

  return { pending, checkNow, toggleActive, remove }
}
