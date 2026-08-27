import { sql } from 'drizzle-orm'
import type { MonitorDailyPoint } from '../../shared/types/monitor'
import { nowInSeconds } from '../services/scheduler'

const DAY_SECONDS = 86_400

/** Widest offset any IANA zone reaches, in minutes on either side of UTC. */
export const MAX_UTC_OFFSET_MINUTES = 840

/**
 * Uptime per day, for the calendar.
 *
 * Always read from the hourly rollups: they reach back a year where the raw
 * heartbeats only keep a few days, and the maintenance job recomputes the open
 * hour every five minutes, so the current day is never more than that stale.
 *
 * `offsetSeconds` shifts the day boundaries onto the viewer's midnight. It is a
 * fixed offset rather than a zone, so the two days around a DST change are off
 * by an hour — which no calendar of daily squares can show anyway.
 */
export function listDailyStats(monitorId: number, days: number, offsetSeconds = 0): MonitorDailyPoint[] {
  const since = nowInSeconds() - days * DAY_SECONDS
  const offset = signedIntegerLiteral(Math.trunc(offsetSeconds))

  const rows = useDatabase().all<{
    day_start: number
    up_count: number
    down_count: number
    avg_latency_ms: number | null
  }>(sql`
    select
      ((bucket_start + ${offset}) / ${integerLiteral(DAY_SECONDS)}) * ${integerLiteral(DAY_SECONDS)}
        - ${offset} as day_start,
      sum(up_count) as up_count,
      sum(down_count) as down_count,
      case when sum(up_count) > 0
        then sum(coalesce(avg_latency_ms, 0) * up_count) / sum(up_count)
        else null end as avg_latency_ms
    from monitor_stats_hourly
    where monitor_id = ${monitorId} and bucket_start >= ${since}
    group by day_start
    order by day_start asc
  `)

  return rows.map(row => ({
    dayStart: row.day_start,
    upCount: row.up_count,
    downCount: row.down_count,
    avgLatencyMs: row.avg_latency_ms === null ? null : Math.round(row.avg_latency_ms)
  }))
}
