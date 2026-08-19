import { STATS_RANGE_SECONDS } from '../../shared/utils/stats'

/** Aggregate figures for the header and the status overview widget. */
export default defineEventHandler(() => {
  const monitors = listMonitorsWithState(0)
  const uptime = calculateUptimeBulk(monitors.map(monitor => monitor.id), STATS_RANGE_SECONDS['24h'])

  const totals = monitors.reduce((counts, monitor) => {
    counts[monitor.state.status] += 1

    return counts
  }, { up: 0, down: 0, pending: 0, paused: 0 })

  const ratios = [...uptime.values()].map(entry => entry.ratio).filter((ratio): ratio is number => ratio !== null)

  return {
    total: monitors.length,
    ...totals,
    uptime24h: ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null
  }
})
