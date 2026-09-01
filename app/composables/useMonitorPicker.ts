import type { Monitor } from '#shared/types/monitor'
import { fuzzyScore } from '#shared/utils/search'

/** One monitor as a picker draws it. */
export interface MonitorPickerItem {
  label: string
  icon: string
  /**
   * The whole breadcrumb, searched but never drawn: the label follows the
   * reader's chosen format, and a group shortened out of it still has to find
   * its monitors here.
   */
  path: string
  description: string
  value: number
}

/**
 * Monitors as a searchable list, shared by every picker that offers one — the
 * widget's monitor fields and the template field of the monitor form.
 *
 * Filtered here rather than by `USelectMenu`, which only ever compares the
 * label it draws, so the callers pass `ignore-filter` and hand their search
 * term in. The closest match is lifted to the top: with a hundred monitors the
 * ranking is what makes a picker usable.
 */
export function useMonitorPicker(source: MaybeRefOrGetter<Monitor[]>) {
  const { monitorPath, fullMonitorPath } = useMonitorPath()

  const items = computed<MonitorPickerItem[]>(() => toValue(source).map(monitor => ({
    label: monitorPath(monitor),
    icon: monitorIcon(monitor),
    path: fullMonitorPath(monitor),
    description: monitorTarget(monitor),
    value: monitor.id
  })))

  function filter(query: string): MonitorPickerItem[] {
    if (!query.trim()) {
      return items.value
    }

    return items.value
      .flatMap((item) => {
        const score = fuzzyScore([item.path, item.description], query)

        return score === null ? [] : [{ item, score }]
      })
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.item)
  }

  return { items, filter }
}
