import type { MonitorStatus } from '#shared/types/monitor'

export interface StatusSummary {
  total: number
  up: number
  down: number
  pending: number
  paused: number
  uptime24h: number | null
}

/**
 * Derived from the shared monitor list rather than fetched. The figures are
 * exactly what `/api/status` computes, so reading them locally keeps the sidebar
 * in step with every incoming check without a request of its own. The endpoint
 * stays for anything outside the browser.
 */
export function useStatusSummary() {
  const { data: monitors } = useMonitors()

  const data = computed<StatusSummary>(() => {
    const totals = monitors.value.reduce((counts, monitor) => {
      counts[monitor.state.status] += 1

      return counts
    }, { up: 0, down: 0, pending: 0, paused: 0 } as Record<MonitorStatus, number>)

    const ratios = monitors.value
      .map(monitor => monitor.uptime24h.ratio)
      .filter((ratio): ratio is number => ratio !== null)

    return {
      total: monitors.value.length,
      ...totals,
      uptime24h: ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null
    }
  })

  return { data }
}
