import type { Heartbeat, Monitor, MonitorStatus, MonitorType } from '../types/monitor'

export const MONITOR_TYPES: MonitorType[] = ['http', 'ping']

export const MONITOR_INTERVAL_BOUNDS = { min: 20, max: 86_400 }
export const MONITOR_TIMEOUT_BOUNDS = { min: 1, max: 120 }
export const MONITOR_RETRY_BOUNDS = { min: 0, max: 10 }
export const MONITOR_PACKET_BOUNDS = { min: 1, max: 10 }

export const MONITOR_TYPE_ICONS: Record<MonitorType, string> = {
  http: 'i-lucide-globe',
  ping: 'i-lucide-radio-tower'
}

export const MONITOR_STATUS_ICONS: Record<MonitorStatus, string> = {
  up: 'i-lucide-circle-check',
  down: 'i-lucide-circle-x',
  pending: 'i-lucide-loader-circle',
  paused: 'i-lucide-circle-pause'
}

/** Heartbeats travelling with a monitor, and drawn in its pulse bar. */
export const MONITOR_HEARTBEAT_HISTORY = 40

/**
 * A pulse bar can only draw the heartbeats that travel with the monitor, so
 * the widget setting stops where that payload does. Asking for more used to
 * pad the bar with empty slots that could never fill.
 */
export const MONITOR_HEARTBEAT_COUNT_BOUNDS = { min: 10, max: MONITOR_HEARTBEAT_HISTORY }

/**
 * Keeps a stored count inside the bounds, so a widget saved while the setting
 * still allowed a wider bar draws a full one instead of half a row of blanks.
 */
export function clampHeartbeatCount(count?: number | null): number {
  const { min, max } = MONITOR_HEARTBEAT_COUNT_BOUNDS

  if (!count || !Number.isFinite(count)) {
    return max
  }

  return Math.min(Math.max(Math.round(count), min), max)
}

/** Heartbeats listed as recent checks on the monitor detail page. */
export const MONITOR_RECENT_CHECK_LIMIT = 50

/**
 * Appends a heartbeat to an oldest first list and trims it back to `limit`.
 * A result that is already in the list is ignored, so a pushed event and a
 * refetch that crossed paths cannot draw the same check twice.
 */
export function appendHeartbeat(list: Heartbeat[], heartbeat: Heartbeat, limit: number): Heartbeat[] {
  if (list.some(entry => entry.id === heartbeat.id)) {
    return list
  }

  return [...list, heartbeat].slice(-limit)
}

/** Human readable target of a monitor, used in lists and notifications. */
export function monitorTarget(monitor: Pick<Monitor, 'type' | 'url' | 'hostname'>): string {
  return monitor.type === 'http' ? monitor.url : monitor.hostname
}

/** Maps a status onto a Nuxt UI colour token. */
export function monitorStatusColor(status: MonitorStatus): 'success' | 'error' | 'warning' | 'neutral' {
  switch (status) {
    case 'up': return 'success'
    case 'down': return 'error'
    case 'pending': return 'warning'
    case 'paused': return 'neutral'
  }
}

/** Icon standing for the kind of check, used wherever the type is not spelled out. */
export function monitorTypeIcon(type: MonitorType): string {
  return MONITOR_TYPE_ICONS[type]
}

export function monitorStatusIcon(status: MonitorStatus): string {
  return MONITOR_STATUS_ICONS[status]
}

/**
 * Parses an expected status code expression such as `200-299,301` into a
 * matcher. Invalid segments are ignored so a typo cannot break the scheduler.
 */
export function parseExpectedStatusCodes(expression: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []

  for (const segment of expression.split(',')) {
    const trimmed = segment.trim()

    if (!trimmed) {
      continue
    }

    const match = /^(\d{3})(?:\s*-\s*(\d{3}))?$/.exec(trimmed)

    if (!match) {
      continue
    }

    const from = Number(match[1])
    const to = match[2] ? Number(match[2]) : from

    ranges.push(from <= to ? [from, to] : [to, from])
  }

  return ranges
}

export function matchesExpectedStatus(statusCode: number, expression: string): boolean {
  const ranges = parseExpectedStatusCodes(expression)

  if (!ranges.length) {
    return statusCode >= 200 && statusCode < 300
  }

  return ranges.some(([from, to]) => statusCode >= from && statusCode <= to)
}
