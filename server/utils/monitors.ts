import { desc, eq, sql } from 'drizzle-orm'
import type { MaintenanceStatus, MaintenanceWindow } from '../../shared/types/maintenance'
import type { Heartbeat, Monitor, MonitorState, MonitorStatsPoint, MonitorUptime, MonitorWithState } from '../../shared/types/monitor'
import type { StatsRange } from '../../shared/types/stats'
import { MONITOR_HEARTBEAT_HISTORY } from '../../shared/utils/monitor'
import { RAW_HEARTBEAT_RANGE_LIMIT_SECONDS, STATS_RANGE_SECONDS, statsBucketSeconds } from '../../shared/utils/stats'
import { heartbeats, monitors, monitorState } from '../database/schema'
import type { MonitorRow, MonitorStateRow } from '../database/schema'
import { nowInSeconds } from '../services/scheduler'

/** Heartbeats rendered in the pulse bar of a monitor card. */
export const DEFAULT_HEARTBEAT_COUNT = MONITOR_HEARTBEAT_HISTORY

const INACTIVE_MAINTENANCE: MaintenanceStatus = {
  active: false,
  until: null,
  since: null,
  manual: false,
  scheduled: false
}

const EMPTY_STATE: MonitorState = {
  status: 'pending',
  lastCheckedAt: null,
  nextCheckAt: null,
  latencyMs: null,
  message: null,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  certificateExpiresAt: null,
  statusChangedAt: null,
  maintenance: INACTIVE_MAINTENANCE
}

export function serializeMonitor(
  row: MonitorRow,
  notificationGroupIds: number[] = [],
  windows: MaintenanceWindow[] = []
): Monitor {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    type: row.type,
    description: row.description,
    groupId: row.groupId,
    intervalSeconds: row.intervalSeconds,
    timeoutSeconds: row.timeoutSeconds,
    retries: row.retries,
    active: row.active,
    url: row.url,
    method: row.method,
    headers: row.headers ?? {},
    body: row.body,
    expectedStatusCodes: row.expectedStatusCodes,
    keyword: row.keyword,
    keywordInverted: row.keywordInverted,
    followRedirects: row.followRedirects,
    ignoreTls: row.ignoreTls,
    checkCertificateExpiry: row.checkCertificateExpiry,
    certificateExpiryWarningDays: row.certificateExpiryWarningDays,
    hostname: row.hostname,
    packetCount: row.packetCount,
    notificationMode: row.notificationMode,
    notificationGroupIds,
    maintenanceStartedAt: row.maintenanceStartedAt,
    maintenanceUntil: row.maintenanceUntil,
    maintenanceWindows: windows,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/**
 * `status` is the one field the stored row does not decide on its own: a paused
 * or a maintained monitor keeps its last result underneath, and reporting that
 * result as up or down would claim something nobody is currently judging.
 *
 * Maintenance is resolved here rather than stored so the answer follows the
 * clock instead of the last check — a monitor on an hourly interval would
 * otherwise enter and leave its window up to an hour late. The browser
 * recomputes the very same function against the shared clock, which is what
 * makes a window open on screen without a request.
 */
export function serializeMonitorState(
  monitor: MonitorRow,
  row: MonitorStateRow | null | undefined,
  maintenance: MaintenanceStatus = resolveMonitorMaintenance(monitor)
): MonitorState {
  const idleStatus = monitor.active ? (maintenance.active ? 'maintenance' : null) : 'paused'

  if (!row) {
    return { ...EMPTY_STATE, status: idleStatus ?? 'pending', maintenance }
  }

  return {
    status: idleStatus ?? row.status,
    lastCheckedAt: row.lastCheckedAt,
    nextCheckAt: row.nextCheckAt,
    latencyMs: row.latencyMs,
    message: row.message,
    consecutiveFailures: row.consecutiveFailures,
    consecutiveSuccesses: row.consecutiveSuccesses,
    certificateExpiresAt: row.certificateExpiresAt,
    statusChangedAt: row.statusChangedAt,
    maintenance
  }
}

/** Loads every monitor together with its state, uptime and recent heartbeats. */
export function listMonitorsWithState(heartbeatCount = DEFAULT_HEARTBEAT_COUNT): MonitorWithState[] {
  const database = useDatabase()
  const rows = database
    .select({ monitor: monitors, state: monitorState })
    .from(monitors)
    .leftJoin(monitorState, eq(monitorState.monitorId, monitors.id))
    .orderBy(monitors.name)
    .all()

  const ids = rows.map(row => row.monitor.id)
  const heartbeatsByMonitor = listRecentHeartbeats(ids, heartbeatCount)
  const uptimeByMonitor = calculateUptimeBulk(ids, STATS_RANGE_SECONDS['24h'])
  const assignments = loadMonitorNotificationGroupIds()
  // One snapshot of the windows and the group tree for the whole list, rather
  // than one walk per row.
  const windows = loadMaintenanceWindows().byMonitor
  const resolveMaintenanceFor = maintenanceResolver()

  return rows.map(({ monitor, state }) => ({
    ...serializeMonitor(monitor, assignments.get(monitor.id) ?? [], windows.get(monitor.id) ?? []),
    state: serializeMonitorState(monitor, state, resolveMaintenanceFor(monitor)),
    uptime24h: uptimeByMonitor.get(monitor.id) ?? emptyUptime(),
    recentHeartbeats: heartbeatsByMonitor.get(monitor.id) ?? []
  }))
}

export function getMonitorWithState(id: number, heartbeatCount = DEFAULT_HEARTBEAT_COUNT): MonitorWithState | null {
  const database = useDatabase()
  const row = database
    .select({ monitor: monitors, state: monitorState })
    .from(monitors)
    .leftJoin(monitorState, eq(monitorState.monitorId, monitors.id))
    .where(eq(monitors.id, id))
    .get()

  if (!row) {
    return null
  }

  return {
    ...serializeMonitor(row.monitor, assignedToMonitor(id), monitorMaintenanceWindows(id)),
    state: serializeMonitorState(row.monitor, row.state),
    uptime24h: calculateUptimeBulk([id], STATS_RANGE_SECONDS['24h']).get(id) ?? emptyUptime(),
    recentHeartbeats: listRecentHeartbeats([id], heartbeatCount).get(id) ?? []
  }
}

/** Every monitor id, for the endpoints whose scope defaults to "all of them". */
export function listMonitorIds(): number[] {
  return useDatabase().select({ id: monitors.id }).from(monitors).all().map(row => row.id)
}

export function getMonitorRow(id: number): MonitorRow | undefined {
  return useDatabase().select().from(monitors).where(eq(monitors.id, id)).get()
}

/**
 * Fetches the last `limit` heartbeats for several monitors in a single query.
 * Avoids the N+1 that a dashboard full of monitor cards would otherwise cause.
 */
export function listRecentHeartbeats(monitorIds: number[], limit: number): Map<number, Heartbeat[]> {
  const result = new Map<number, Heartbeat[]>()

  if (!monitorIds.length || limit <= 0) {
    return result
  }

  const rows = useDatabase().all<{
    id: number
    monitor_id: number
    checked_at: number
    status: 'up' | 'down'
    reported_status: 'up' | 'down' | 'pending'
    latency_ms: number | null
    status_code: number | null
    message: string | null
  }>(sql`
    select id, monitor_id, checked_at, status, reported_status, latency_ms, status_code, message
    from (
      select *, row_number() over (partition by monitor_id order by checked_at desc, id desc) as position
      from heartbeats
      where monitor_id in ${monitorIds}
    )
    where position <= ${limit}
    order by checked_at asc, id asc
  `)

  for (const row of rows) {
    const list = result.get(row.monitor_id) ?? []

    list.push({
      id: row.id,
      monitorId: row.monitor_id,
      checkedAt: row.checked_at,
      status: row.status,
      reportedStatus: row.reported_status,
      latencyMs: row.latency_ms,
      statusCode: row.status_code,
      message: row.message
    })

    result.set(row.monitor_id, list)
  }

  return result
}

/** Uptime over a window, read from raw heartbeats or the hourly rollups. */
export function calculateUptimeBulk(monitorIds: number[], rangeSeconds: number): Map<number, MonitorUptime> {
  const result = new Map<number, MonitorUptime>()

  if (!monitorIds.length) {
    return result
  }

  const since = nowInSeconds() - rangeSeconds
  const useRaw = rangeSeconds <= RAW_HEARTBEAT_RANGE_LIMIT_SECONDS

  const rows = useRaw
    ? useDatabase().all<UptimeAggregateRow>(sql`
        select
          monitor_id,
          sum(case when status = 'up' then 1 else 0 end) as up_count,
          sum(case when status = 'down' then 1 else 0 end) as down_count,
          avg(case when status = 'up' then latency_ms end) as avg_latency_ms
        from heartbeats
        where monitor_id in ${monitorIds}
          and checked_at >= ${since}
          and reported_status not in ${unjudgedStatuses}
        group by monitor_id
      `)
    : useDatabase().all<UptimeAggregateRow>(sql`
        select
          monitor_id,
          sum(up_count) as up_count,
          sum(down_count) as down_count,
          case when sum(up_count) > 0
            then sum(coalesce(avg_latency_ms, 0) * up_count) / sum(up_count)
            else null end as avg_latency_ms
        from monitor_stats_hourly
        where monitor_id in ${monitorIds} and bucket_start >= ${since}
        group by monitor_id
      `)

  for (const row of rows) {
    const total = row.up_count + row.down_count

    result.set(row.monitor_id, {
      ratio: total > 0 ? row.up_count / total : null,
      upCount: row.up_count,
      downCount: row.down_count,
      avgLatencyMs: row.avg_latency_ms === null ? null : Math.round(row.avg_latency_ms)
    })
  }

  return result
}

/** Time series powering the latency chart of a monitor. */
export function getMonitorStatsSeries(monitorId: number, range: StatsRange): MonitorStatsPoint[] {
  const monitor = getMonitorRow(monitorId)

  if (!monitor) {
    return []
  }

  const rangeSeconds = STATS_RANGE_SECONDS[range]
  const baseBucketSeconds = statsBucketSeconds(range)
  // A chart bucket shorter than the monitor interval manufactures empty space:
  // a five minute monitor in thirty second buckets would appear absent nine
  // times out of ten while behaving exactly as configured. Keep bucket edges on
  // multiples of the range's base width, but make each wide enough to expect a
  // reading from this monitor.
  const bucketSeconds = Math.ceil(monitor.intervalSeconds / baseBucketSeconds) * baseBucketSeconds
  const now = nowInSeconds()
  const since = now - rangeSeconds
  const useRaw = rangeSeconds <= RAW_HEARTBEAT_RANGE_LIMIT_SECONDS

  /*
   * Grouped and ordered by the expression itself rather than by the name it is
   * selected under. SQLite resolves a bare `bucket_start` in `group by` against
   * the source column first, and the rollup table has one of exactly that name:
   * the query would then return one row per stored hour, each labelled with the
   * truncated timestamp of the bucket it belongs to, so several rows share a
   * timestamp and no bucketing happens at all.
   */
  const bucket = useRaw
    ? sql`(checked_at / ${integerLiteral(bucketSeconds)}) * ${integerLiteral(bucketSeconds)}`
    : sql`(bucket_start / ${integerLiteral(bucketSeconds)}) * ${integerLiteral(bucketSeconds)}`

  const rows = useRaw
    ? useDatabase().all<StatsAggregateRow>(sql`
        select
          ${bucket} as bucket_start,
          sum(case when reported_status not in ${unjudgedStatuses} and status = 'up' then 1 else 0 end) as up_count,
          sum(case when reported_status not in ${unjudgedStatuses} and status = 'down' then 1 else 0 end) as down_count,
          sum(case when reported_status = 'maintenance' then 1 else 0 end) as maintenance_count,
          sum(case when reported_status = 'unknown' then 1 else 0 end) as unknown_count,
          avg(case when reported_status not in ${unjudgedStatuses} and status = 'up' then latency_ms end) as avg_latency_ms,
          min(case when reported_status not in ${unjudgedStatuses} and status = 'up' then latency_ms end) as min_latency_ms,
          max(case when reported_status not in ${unjudgedStatuses} and status = 'up' then latency_ms end) as max_latency_ms
        from heartbeats
        where monitor_id = ${monitorId} and checked_at >= ${since}
        group by ${bucket}
        order by ${bucket} asc
      `)
    : useDatabase().all<StatsAggregateRow>(sql`
        select
          ${bucket} as bucket_start,
          sum(up_count) as up_count,
          sum(down_count) as down_count,
          sum(maintenance_count) as maintenance_count,
          sum(unknown_count) as unknown_count,
          case when sum(up_count) > 0
            then sum(coalesce(avg_latency_ms, 0) * up_count) / sum(up_count)
            else null end as avg_latency_ms,
          min(min_latency_ms) as min_latency_ms,
          max(max_latency_ms) as max_latency_ms
        from monitor_stats_hourly
        where monitor_id = ${monitorId} and bucket_start >= ${since}
        group by ${bucket}
        order by ${bucket} asc
      `)

  // A missing target row does not prove the service was down: the check may
  // have landed just across a bucket boundary while another monitor proves the
  // scheduler was alive. Only a bucket with no reading from any monitor is an
  // instance-wide monitoring gap.
  const serviceRows = useRaw
    ? useDatabase().all<{ bucket_start: number }>(sql`
        select ${bucket} as bucket_start
        from heartbeats
        where checked_at >= ${since}
        group by ${bucket}
      `)
    : useDatabase().all<{ bucket_start: number }>(sql`
        select ${bucket} as bucket_start
        from monitor_stats_hourly
        where bucket_start >= ${since}
          and (up_count + down_count + maintenance_count + unknown_count) > 0
        group by ${bucket}
      `)

  const byBucket = new Map(rows.map(row => [row.bucket_start, row]))
  const serviceBuckets = new Set(serviceRows.map(row => row.bucket_start))
  const firstBucket = Math.floor(since / bucketSeconds) * bucketSeconds
  const currentBucket = Math.floor(now / bucketSeconds) * bucketSeconds
  const creationBucket = Math.floor(monitor.createdAt / bucketSeconds) * bucketSeconds
  const points: MonitorStatsPoint[] = []

  /*
   * Return the whole selected time axis, not only the buckets that happened to
   * contain a heartbeat. This is what keeps three visually similar but
   * semantically different spaces apart:
   *
   * - before `creationBucket`: the monitor did not exist, so the chart stays
   *   deliberately blank;
   * - an empty, completed bucket afterwards in which no monitor recorded
   *   anything: the monitoring service left an unexplained gap;
   * - a bucket without this monitor but with other readings: the instance was
   *   alive, but this monitor may still have missed an expected check;
   * - the current bucket: still open, and therefore not missing merely because
   *   its next scheduled check has not landed yet.
   *
   * At most 120 points are emitted for an hour and 365 for a year. Filling the
   * axis here therefore costs less than making every chart infer it differently
   * in the browser, and every consumer receives the same account of history.
   */
  for (let bucketStart = firstBucket; bucketStart <= currentBucket; bucketStart += bucketSeconds) {
    const row = byBucket.get(bucketStart)

    if (row) {
      points.push({
        bucketStart,
        upCount: row.up_count,
        downCount: row.down_count,
        maintenanceCount: row.maintenance_count,
        unknownCount: row.unknown_count,
        missingCount: 0,
        serviceMissing: false,
        beforeCreation: false,
        avgLatencyMs: row.avg_latency_ms === null ? null : Math.round(row.avg_latency_ms),
        minLatencyMs: row.min_latency_ms,
        maxLatencyMs: row.max_latency_ms
      })
      continue
    }

    const beforeCreation = bucketStart < creationBucket
    const completed = bucketStart < currentBucket

    points.push({
      bucketStart,
      upCount: 0,
      downCount: 0,
      maintenanceCount: 0,
      unknownCount: 0,
      missingCount: !beforeCreation && completed ? 1 : 0,
      serviceMissing: !beforeCreation && completed && !serviceBuckets.has(bucketStart),
      beforeCreation,
      avgLatencyMs: null,
      minLatencyMs: null,
      maxLatencyMs: null
    })
  }

  /*
   * A single empty raw bucket is not evidence that a check was missed. Checks
   * sit on their own cadence rather than on chart boundaries, so one can land
   * just before an edge and the next just after the following edge. Requiring
   * two consecutive empty buckets removes those boundary artefacts while still
   * revealing a real interruption after at most one chart bucket. Apply the
   * same rule to instance-wide evidence independently, so a chart can explain
   * whether only this monitor or the whole scheduler stopped reporting.
   * Hourly rollups need no such grace: an entirely empty hour is already strong
   * evidence, and hiding a second hour would make long-range charts inaccurate.
   */
  if (useRaw || bucketSeconds < monitor.intervalSeconds * 2) {
    function clearSingleBucketRuns(
      matches: (point: MonitorStatsPoint) => boolean,
      clear: (point: MonitorStatsPoint) => void
    ) {
      let runStart = -1

      for (let index = 0; index <= points.length; index++) {
        const point = points[index]

        if (point && matches(point)) {
          runStart = runStart === -1 ? index : runStart
          continue
        }

        if (runStart !== -1 && index - runStart < 2) {
          clear(points[runStart]!)
        }

        runStart = -1
      }
    }

    clearSingleBucketRuns(point => point.missingCount > 0, (point) => {
      point.missingCount = 0
      point.serviceMissing = false
    })
    clearSingleBucketRuns(point => point.serviceMissing, point => point.serviceMissing = false)
  }

  return points
}

export function getHeartbeats(monitorId: number, limit: number): Heartbeat[] {
  return useDatabase()
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.monitorId, monitorId))
    .orderBy(desc(heartbeats.checkedAt), desc(heartbeats.id))
    .limit(limit)
    .all()
    .reverse()
}

export function emptyUptime(): MonitorUptime {
  return { ratio: null, upCount: 0, downCount: 0, avgLatencyMs: null }
}

interface UptimeAggregateRow {
  monitor_id: number
  up_count: number
  down_count: number
  avg_latency_ms: number | null
}

interface StatsAggregateRow {
  bucket_start: number
  up_count: number
  down_count: number
  maintenance_count: number
  unknown_count: number
  avg_latency_ms: number | null
  min_latency_ms: number | null
  max_latency_ms: number | null
}
