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

/**
 * Heartbeats travelling with every monitor in the shared list payload.
 *
 * It covers a half width dashboard cell at the pitch below. Wider pulse bars
 * extend that baseline on demand instead of making every list and polling
 * response carry enough history for the widest possible widget.
 */
export const MONITOR_HEARTBEAT_HISTORY = 60

/** Upper bound for an on-demand pulse bar history request. */
export const MONITOR_HEARTBEAT_HISTORY_MAX = 500

/**
 * Geometry of a pulse bar, in pixels. Fixed rather than stretched, so the same
 * stretch of history reads the same width on a dashboard cell, on the monitor
 * list and on the detail page. The literal classes exist because Tailwind
 * cannot emit sizes assembled at runtime; keep the two in step.
 */
export const HEARTBEAT_BAR_WIDTH_PX = 6
export const HEARTBEAT_BAR_GAP_PX = 3
export const HEARTBEAT_BAR_PITCH_PX = HEARTBEAT_BAR_WIDTH_PX + HEARTBEAT_BAR_GAP_PX
export const HEARTBEAT_BAR_CLASS = 'w-[6px]'
export const HEARTBEAT_ROW_CLASS = 'gap-[3px]'

/** Number of fixed-width bars needed to cover a row without stretching them. */
export function heartbeatCountForWidth(width: number): number {
  const count = Math.ceil((Math.max(0, width) + HEARTBEAT_BAR_GAP_PX) / HEARTBEAT_BAR_PITCH_PX)

  return Math.min(MONITOR_HEARTBEAT_HISTORY_MAX, Math.max(1, count))
}

/**
 * Heartbeats loaded for the detail page. More than the table lists, because the
 * same request feeds a pulse bar that is as wide as the page.
 */
export const MONITOR_RECENT_CHECK_LIMIT = 120

/** Rows the recent checks table shows of them. */
export const MONITOR_RECENT_TABLE_ROWS = 50

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

/** Semantic background class for status dots and bars. */
export function monitorStatusBackgroundClass(status: MonitorStatus): string {
  switch (status) {
    case 'up': return 'bg-success'
    case 'down': return 'bg-error'
    case 'pending': return 'bg-warning'
    case 'paused': return 'bg-muted'
  }
}

/** Semantic text class for status figures and icons. */
export function monitorStatusTextClass(status: MonitorStatus): string {
  switch (status) {
    case 'up': return 'text-success'
    case 'down': return 'text-error'
    case 'pending': return 'text-warning'
    case 'paused': return 'text-dimmed'
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
