import { lt, sql } from 'drizzle-orm'
import { heartbeats, monitorStatsHourly } from '../database/schema'
import { nowInSeconds } from './scheduler'

const HOUR_SECONDS = 3600
const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000

let timer: NodeJS.Timeout | null = null

/**
 * Periodically rolls raw heartbeats into hourly buckets and prunes data that
 * outlived its retention window.
 */
export function startMaintenance(): void {
  if (timer) {
    return
  }

  runMaintenance()

  timer = setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS)
  timer.unref?.()
}

export function stopMaintenance(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function runMaintenance(): void {
  try {
    aggregateHourlyStats()
    pruneExpiredData()
    pruneExpiredMaintenanceOverrides()
  } catch (error) {
    console.error('[maintenance] run failed:', error)
  }
}

/**
 * Aggregates heartbeats into hour buckets. The current, still incomplete hour is
 * always recomputed so long range charts stay close to live.
 */
export function aggregateHourlyStats(): void {
  const database = useDatabase()
  const now = nowInSeconds()
  const currentBucket = Math.floor(now / HOUR_SECONDS) * HOUR_SECONDS
  const oldestHeartbeat = database
    .select({ value: sql<number | null>`min(${heartbeats.checkedAt})` })
    .from(heartbeats)
    .get()?.value

  if (!oldestHeartbeat) {
    return
  }

  const storedFrom = getSetting<number | null>(SETTING_KEYS.aggregatedThrough, null)
  const from = Math.max(oldestHeartbeat, storedFrom ?? oldestHeartbeat)

  /*
   * A check that ran under maintenance is counted apart rather than into the two
   * columns the uptime is computed from. That single `case` is what carries the
   * exclusion into every long range figure at once: the rollup branches of the
   * uptime, of the latency chart, of the calendar and of the incident
   * reconstruction all read these columns and need no clause of their own.
   *
   * Latency is left out of the maintenance readings too. A server that is
   * rebooting answers slowly when it answers at all, and letting that into the
   * average would move the very curve the window exists to protect.
   *
   * Legacy rows can outlive a monitor if foreign keys were disabled when it was
   * deleted. Ignore those rows so one orphan cannot block every rollup and the
   * retention cleanup that follows. The original readings remain untouched.
   */
  database.run(sql`
    insert into monitor_stats_hourly
      (monitor_id, bucket_start, up_count, down_count, maintenance_count, unknown_count,
       avg_latency_ms, min_latency_ms, max_latency_ms)
    select
      monitor_id,
      (checked_at / ${integerLiteral(HOUR_SECONDS)}) * ${integerLiteral(HOUR_SECONDS)} as bucket_start,
      sum(case when reported_status not in ${unjudgedStatuses} and status = 'up' then 1 else 0 end),
      sum(case when reported_status not in ${unjudgedStatuses} and status = 'down' then 1 else 0 end),
      sum(case when reported_status = 'maintenance' then 1 else 0 end),
      sum(case when reported_status = 'unknown' then 1 else 0 end),
      cast(avg(case when reported_status not in ${unjudgedStatuses} and status = 'up' then latency_ms end) as integer),
      min(case when reported_status not in ${unjudgedStatuses} and status = 'up' then latency_ms end),
      max(case when reported_status not in ${unjudgedStatuses} and status = 'up' then latency_ms end)
    from heartbeats
    where checked_at >= ${from}
      and exists (select 1 from monitors where monitors.id = heartbeats.monitor_id)
    group by monitor_id, bucket_start
    on conflict(monitor_id, bucket_start) do update set
      up_count = excluded.up_count,
      down_count = excluded.down_count,
      maintenance_count = excluded.maintenance_count,
      unknown_count = excluded.unknown_count,
      avg_latency_ms = excluded.avg_latency_ms,
      min_latency_ms = excluded.min_latency_ms,
      max_latency_ms = excluded.max_latency_ms
  `)

  setSetting(SETTING_KEYS.aggregatedThrough, currentBucket)
}

/** Drops raw heartbeats and hourly buckets beyond their retention window. */
export function pruneExpiredData(): void {
  const database = useDatabase()
  const { retention } = useRuntimeConfig()
  const now = nowInSeconds()

  if (retention.heartbeatDays > 0) {
    database.delete(heartbeats).where(lt(heartbeats.checkedAt, now - retention.heartbeatDays * 86_400)).run()
  }

  if (retention.hourlyStatsDays > 0) {
    database
      .delete(monitorStatsHourly)
      .where(lt(monitorStatsHourly.bucketStart, now - retention.hourlyStatsDays * 86_400))
      .run()
  }

  if (retention.notificationDays > 0) {
    // The newest delivery per monitor and channel is kept whatever its age: it
    // is what tells a later recovery whether the outage was ever announced. An
    // outage lasting longer than the retention window would otherwise end in
    // silence.
    database.run(sql`
      delete from notification_deliveries
      where status in ('sent', 'failed')
        and created_at < ${integerLiteral(now - retention.notificationDays * 86_400)}
        and id not in (select max(id) from notification_deliveries group by monitor_id, channel_id)
    `)
  }
}
