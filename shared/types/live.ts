import type { Heartbeat, MonitorState, MonitorUptime } from './monitor'
import type { UplinkStatus } from './uplink'

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

/**
 * The instance's own connectivity changed.
 *
 * Pushed rather than polled because it is what explains the readings a browser
 * is receiving at the same moment: without it a reader watches every monitor
 * fall silent and has nothing on screen saying why.
 */
export interface UplinkChangedEvent {
  type: 'uplink.changed'
  uplink: UplinkStatus
}

/** Everything the event stream pushes to a connected browser. */
export type LiveEvent = MonitorCheckedEvent | UplinkChangedEvent
