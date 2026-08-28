import type { MonitorPathFormat } from '#shared/types/group'
import type { Monitor } from '#shared/types/monitor'
import {
  buildMonitorGroupTree,
  flattenMonitorGroupTree,
  isMonitorPathFormat,
  joinMonitorPath,
  shortenMonitorPath
} from '#shared/utils/group'

/** Enough of a monitor to place it in the tree. */
type Located = Pick<Monitor, 'name' | 'groupId'>

/**
 * How much of the group path every breadcrumb spells out.
 *
 * Shared state rather than a preference read per caller: a breadcrumb is drawn
 * once per list row, and Nuxt builds a separate ref on every `useCookie` call
 * which only ever agrees with its siblings where the browser has a
 * `cookieStore`. Changing the setting would leave most rows behind.
 */
export function useMonitorPathFormat() {
  return useState<MonitorPathFormat>('monitor-path-format', () => 'full')
}

/**
 * Binds that shared state to its cookie. Called once, from the dashboard
 * layout, so the whole application reads one value and the server renders the
 * breadcrumbs the browser is about to show.
 */
export function useMonitorPathPreference() {
  const format = useMonitorPathFormat()
  const stored = useUiPreference<MonitorPathFormat>('monitor-path', () => 'full', isMonitorPathFormat)

  format.value = stored.value

  // Any control may write the shared state; the cookie is written from here,
  // the one place holding a reference to it.
  watch(format, (value) => {
    stored.value = value
  })
}

/**
 * Breadcrumbs for monitors, resolved against the shared group cache.
 *
 * The sidebar and the grouped list draw the tree around a monitor, so a bare
 * name identifies it there. Everywhere else — a widget, a filtered list, a
 * dialog, a toast — the surrounding tree is gone and two groups may well hold
 * an `api` or a `database`, so the path is spelled out, as far as the reader's
 * chosen format spells it.
 *
 * Built from the groups alone rather than from `useMonitorTree`: a breadcrumb
 * is drawn once per row, and the full tree would have every one of those rows
 * rebuilt on every check result that reaches the monitor list.
 */
export function useMonitorPath() {
  const { data: groups } = useMonitorGroups()
  const format = useMonitorPathFormat()

  const pathsById = computed(() => new Map(
    flattenMonitorGroupTree(buildMonitorGroupTree(groups.value)).map(node => [node.id, node.path])
  ))

  /** Every group name from the root down to the monitor's own group. */
  function groupSegments(monitor: Pick<Monitor, 'groupId'> | null | undefined): string[] {
    const groupId = monitor?.groupId ?? null

    return groupId === null ? [] : pathsById.value.get(groupId) ?? []
  }

  /** The same cut down to the chosen format, which may leave nothing at all. */
  function shorten(segments: string[]): string[] {
    return shortenMonitorPath(segments, format.value)
  }

  /** The group breadcrumb as shown, or undefined when nothing is left of it. */
  function groupPath(monitor: Pick<Monitor, 'groupId'> | null | undefined): string | undefined {
    const segments = shorten(groupSegments(monitor))

    return segments.length ? joinMonitorPath(segments) : undefined
  }

  /** The monitor as shown: its groups, shortened, and its own name. */
  function monitorPath(monitor: Located | null | undefined): string {
    return monitor ? joinMonitorPath([...shorten(groupSegments(monitor)), monitor.name]) : ''
  }

  /**
   * The whole path whatever the format is set to. Tooltips and the search
   * ignore the setting: it decides how much is worth the space in a row, not
   * what the reader is allowed to find or read.
   */
  function fullMonitorPath(monitor: Located | null | undefined): string {
    return monitor ? joinMonitorPath([...groupSegments(monitor), monitor.name]) : ''
  }

  return { format, groupSegments, shorten, groupPath, monitorPath, fullMonitorPath }
}
