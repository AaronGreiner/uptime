import { sql } from 'drizzle-orm'
import type { Incident, IncidentSummary } from '../../shared/types/incident'
import { nowInSeconds } from '../services/scheduler'

const HOUR_SECONDS = 3600

/**
 * Upper bound on the outages a single request reconstructs. The summary is
 * computed over the same set, so a window with more outages than this reports
 * the most recent ones rather than everything.
 */
export const INCIDENT_SCAN_LIMIT = 500

/**
 * Runs of failed checks, newest first.
 *
 * Raw heartbeats resolve an outage to the check, but they are only kept for a
 * few days, so a longer window falls back to the hourly rollups and reports the
 * boundaries to the hour. Either way a run only counts once it is longer than
 * the monitor's `retries`, which is exactly when the application itself calls
 * the monitor down and sends a notification about it.
 *
 * An outage that started before the window is clipped to it; there is nothing
 * left in range to reconstruct its real beginning from.
 */
export function listIncidents(monitorIds: number[], rangeSeconds: number): Incident[] {
  if (!monitorIds.length) {
    return []
  }

  const { retention } = useRuntimeConfig()
  const since = nowInSeconds() - rangeSeconds
  const rawAvailableFrom = nowInSeconds() - retention.heartbeatDays * 86_400

  return retention.heartbeatDays > 0 && since >= rawAvailableFrom
    ? listIncidentsFromHeartbeats(monitorIds, since)
    : listIncidentsFromRollups(monitorIds, since)
}

function listIncidentsFromHeartbeats(monitorIds: number[], since: number): Incident[] {
  const rows = useDatabase().all<{
    monitor_id: number
    started_at: number
    ended_at: number | null
    checks: number
    message: string | null
  }>(sql`
    with marked as (
      select
        monitor_id,
        id,
        checked_at,
        status,
        row_number() over (partition by monitor_id order by checked_at, id)
          - row_number() over (partition by monitor_id, status order by checked_at, id) as island
      from heartbeats
      where monitor_id in ${monitorIds} and checked_at >= ${since}
    ),
    islands as (
      select
        monitor_id,
        min(checked_at) as started_at,
        max(checked_at) as last_down_at,
        min(id) as first_id,
        count(*) as checks
      from marked
      where status = 'down'
      group by monitor_id, island
    )
    select
      islands.monitor_id,
      islands.started_at,
      islands.checks,
      (select h.message from heartbeats h where h.id = islands.first_id) as message,
      (
        select min(h.checked_at) from heartbeats h
        where h.monitor_id = islands.monitor_id
          and h.status = 'up'
          and h.checked_at > islands.last_down_at
      ) as ended_at
    from islands
    join monitors on monitors.id = islands.monitor_id
    where islands.checks > monitors.retries
    order by islands.started_at desc
    limit ${INCIDENT_SCAN_LIMIT}
  `)

  return rows.map(row => ({
    monitorId: row.monitor_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    checks: row.checks,
    message: row.message,
    approximate: false
  }))
}

function listIncidentsFromRollups(monitorIds: number[], since: number): Incident[] {
  const currentBucket = Math.floor(nowInSeconds() / HOUR_SECONDS) * HOUR_SECONDS

  const rows = useDatabase().all<{
    monitor_id: number
    started_at: number
    last_bucket: number
    checks: number
    down_seconds: number
    is_down: number
  }>(sql`
    with marked as (
      select
        monitor_id,
        bucket_start,
        up_count,
        down_count,
        row_number() over (partition by monitor_id order by bucket_start)
          - row_number() over (
              partition by monitor_id, case when down_count > 0 then 1 else 0 end
              order by bucket_start
            ) as island
      from monitor_stats_hourly
      where monitor_id in ${monitorIds} and bucket_start >= ${since}
    ),
    islands as (
      select
        monitor_id,
        min(bucket_start) as started_at,
        max(bucket_start) as last_bucket,
        sum(down_count) as checks,
        -- A bucket is not an hour of downtime, it is an hour in which some of
        -- the checks failed. Rounding every blip up to the full hour would put
        -- the mean time to recovery of a three minute outage at one hour.
        sum(
          case when (up_count + down_count) > 0
            then (${integerLiteral(HOUR_SECONDS)} * 1.0 * down_count) / (up_count + down_count)
            else 0 end
        ) as down_seconds
      from marked
      where down_count > 0
      group by monitor_id, island
    )
    select
      islands.monitor_id,
      islands.started_at,
      islands.last_bucket,
      islands.checks,
      islands.down_seconds,
      case when monitors.active and monitor_state.status = 'down' then 1 else 0 end as is_down
    from islands
    join monitors on monitors.id = islands.monitor_id
    left join monitor_state on monitor_state.monitor_id = islands.monitor_id
    where islands.checks > monitors.retries
    order by islands.started_at desc
    limit ${INCIDENT_SCAN_LIMIT}
  `)

  return rows.map((row) => {
    // Reaching into the open hour is not enough to call an outage current: that
    // bucket only says a check failed in it. The monitor has to still be down.
    const ongoing = row.last_bucket >= currentBucket && row.is_down === 1

    return {
      monitorId: row.monitor_id,
      startedAt: row.started_at,
      endedAt: ongoing ? null : row.started_at + Math.max(60, Math.round(row.down_seconds)),
      checks: row.checks,
      message: null,
      approximate: true
    }
  })
}

/** Seconds an outage lasted, counting an ongoing one up to now. */
export function incidentDuration(incident: Incident, now = nowInSeconds()): number {
  return Math.max(0, (incident.endedAt ?? now) - incident.startedAt)
}

export function summarizeIncidents(incidents: Incident[], rangeSeconds: number): IncidentSummary {
  const now = nowInSeconds()
  const durations = incidents.map(incident => incidentDuration(incident, now))
  const finished = incidents
    .map((incident, index) => ({ incident, duration: durations[index]! }))
    .filter(entry => entry.incident.endedAt !== null)

  const totalDownSeconds = durations.reduce((sum, duration) => sum + duration, 0)

  return {
    count: incidents.length,
    ongoing: incidents.length - finished.length,
    totalDownSeconds,
    longestSeconds: durations.length ? Math.max(...durations) : null,
    mttrSeconds: finished.length
      ? Math.round(finished.reduce((sum, entry) => sum + entry.duration, 0) / finished.length)
      : null,
    // Operational MTBF over a fixed window: the time the monitors were up,
    // divided by the number of times they went down.
    mtbfSeconds: incidents.length
      ? Math.round(Math.max(0, rangeSeconds - totalDownSeconds) / incidents.length)
      : null
  }
}
