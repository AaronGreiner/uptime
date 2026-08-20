import type { Heartbeat, MonitorState, MonitorUptime } from './monitor'

/**
 * A check finished and the monitor moved on. Carries everything the clients keep
 * in their monitor cache, so a browser can apply the result without asking for
 * the list again.
 */
export interface MonitorCheckedEvent {
  type: 'monitor.checked'
  monitorId: number
  state: MonitorState
  uptime24h: MonitorUptime
  heartbeat: Heartbeat
}

/** Everything the event stream pushes to a connected browser. */
export type LiveEvent = MonitorCheckedEvent
