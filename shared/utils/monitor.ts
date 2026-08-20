import type { Monitor, MonitorStatus, MonitorType } from '../types/monitor'

export const MONITOR_TYPES: MonitorType[] = ['http', 'ping']

export const MONITOR_INTERVAL_BOUNDS = { min: 20, max: 86_400 }
export const MONITOR_TIMEOUT_BOUNDS = { min: 1, max: 120 }
export const MONITOR_RETRY_BOUNDS = { min: 0, max: 10 }
export const MONITOR_PACKET_BOUNDS = { min: 1, max: 10 }

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
  return type === 'http' ? 'i-lucide-globe' : 'i-lucide-radio-tower'
}

export function monitorStatusIcon(status: MonitorStatus): string {
  switch (status) {
    case 'up': return 'i-lucide-circle-check'
    case 'down': return 'i-lucide-circle-x'
    case 'pending': return 'i-lucide-loader-circle'
    case 'paused': return 'i-lucide-circle-pause'
  }
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
