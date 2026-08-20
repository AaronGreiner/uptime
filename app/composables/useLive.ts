import type { LiveConnection } from '~/plugins/live'
import type { MonitorCheckedEvent } from '#shared/types/live'
import type { MonitorWithState } from '#shared/types/monitor'
import { MONITOR_HEARTBEAT_HISTORY, appendHeartbeat } from '#shared/utils/monitor'

/**
 * A closed or stalled stream is caught by reloading the list this often. It also
 * picks up monitors that were created elsewhere, which no check announces.
 */
const RECONCILE_INTERVAL_MS = 60_000

/** The shared event stream. See `plugins/live.ts`. */
export function useLive(): LiveConnection {
  return useNuxtApp().$live
}

/**
 * Subscribes to check results for the lifetime of the caller, optionally
 * narrowed to a single monitor. Passing a monitor id that is null matches
 * nothing, which is what a widget without a monitor assigned wants.
 */
export function onMonitorChecked(
  handler: (event: MonitorCheckedEvent) => void,
  monitorId?: MaybeRefOrGetter<number | null | undefined>
): void {
  const stop = useLive().subscribe((event) => {
    if (event.type !== 'monitor.checked') {
      return
    }

    if (monitorId !== undefined && event.monitorId !== toValue(monitorId)) {
      return
    }

    handler(event)
  })

  onScopeDispose(stop)
}

/** Folds a pushed check result into the monitor it belongs to. */
export function applyCheckResult(monitor: MonitorWithState, event: MonitorCheckedEvent): MonitorWithState {
  return {
    ...monitor,
    state: event.state,
    uptime24h: event.uptime24h,
    recentHeartbeats: appendHeartbeat(monitor.recentHeartbeats, event.heartbeat, MONITOR_HEARTBEAT_HISTORY)
  }
}

/**
 * Keeps the shared monitor list in step with the incoming check results. Called
 * once from the dashboard layout: every card, widget, sidebar entry and status
 * figure reads that one cache, so patching it updates the whole application the
 * moment a check lands.
 */
export function useLiveMonitors(): void {
  const { data: monitors, refresh } = useMonitors()

  onMonitorChecked((event) => {
    monitors.value = monitors.value.map(monitor => (
      monitor.id === event.monitorId ? applyCheckResult(monitor, event) : monitor
    ))
  })

  const stop = useLive().onResumed(() => {
    void refresh()
  })

  onScopeDispose(stop)

  usePolling(refresh, RECONCILE_INTERVAL_MS)
}
