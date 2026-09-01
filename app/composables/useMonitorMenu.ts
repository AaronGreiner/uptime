import type { DropdownMenuItem } from '@nuxt/ui'
import type { MonitorWithState } from '#shared/types/monitor'

interface MonitorMenuHandlers {
  /** Opens the form; the dialog itself lives on the page that draws the menu. */
  edit: (monitor: MonitorWithState) => unknown
  /** Opens the confirmation; the deletion runs from there. */
  remove: (monitor: MonitorWithState) => unknown
}

type MonitorMenuActions = Pick<
  ReturnType<typeof useMonitorActions>,
  'checkNow' | 'toggleActive' | 'setMaintenance' | 'endMaintenance'
>

/**
 * The admin actions on one monitor, as a dropdown.
 *
 * The list and the detail page offer the same five things, so both read them
 * from here rather than each drawing its own row: the same monitor has to
 * answer to the same actions, under the same labels, in the same order,
 * wherever it is shown.
 */
export function useMonitorMenu(actions: MonitorMenuActions, handlers: MonitorMenuHandlers) {
  const { t } = useI18n()
  const { menuItem: maintenanceMenuItem } = useMaintenanceMenu()

  /**
   * `checkNow` is dropped where the caller already draws it as a button of its
   * own — the detail page does, since it is the one action a reader takes over
   * and over while watching a single monitor.
   */
  function menuItems(monitor: MonitorWithState, { checkNow = true } = {}): DropdownMenuItem[][] {
    return [[{
      label: t('common.edit'),
      icon: 'i-lucide-pencil',
      onSelect: () => handlers.edit(monitor)
    },
    ...(checkNow
      ? [{
          label: t('monitor.actions.checkNow'),
          icon: 'i-lucide-refresh-cw',
          onSelect: () => actions.checkNow(monitor)
        }]
      : []), {
      label: t(monitor.active ? 'monitor.actions.pause' : 'monitor.actions.resume'),
      icon: monitor.active ? 'i-lucide-pause' : 'i-lucide-play',
      onSelect: () => actions.toggleActive(monitor)
    },
    maintenanceMenuItem(
      monitor,
      duration => actions.setMaintenance(monitor, duration),
      () => actions.endMaintenance(monitor)
    )], [{
      label: t('common.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => handlers.remove(monitor)
    }]]
  }

  return { menuItems }
}
