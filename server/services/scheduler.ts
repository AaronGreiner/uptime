import { and, eq, isNull, lte, or } from 'drizzle-orm'
import type { MaintenanceStatus } from '../../shared/types/maintenance'
import type { EvaluatedMonitorStatus, HeartbeatReportedStatus } from '../../shared/types/monitor'
import type { NotificationEvent } from '../../shared/types/notification'
import { monitorTarget } from '../../shared/utils/monitor'
import { STATS_RANGE_SECONDS } from '../../shared/utils/stats'
import { heartbeats, monitorState, monitors } from '../database/schema'
import type { HeartbeatRow, MonitorRow, MonitorStateRow } from '../database/schema'
import { nowInSeconds } from '../utils/time'
import { executeCheck } from './checks'
import type { CheckResult } from './checks'
import { enqueueNotificationEvent } from './notifications'
import { ensureUplinkVerdict, isUplinkDown, shouldWithholdCheckResult } from './uplink'

/** Monitor ids currently being checked, so a slow check is never queued twice. */
const inFlight = new Set<number>()

let timer: NodeJS.Timeout | null = null

export function startScheduler(): void {
  const { scheduler } = useRuntimeConfig()

  if (timer) {
    return
  }

  timer = setInterval(() => {
    void runDueChecks().catch(error => console.error('[scheduler] tick failed:', error))
  }, scheduler.tickIntervalMs)

  // Never keep the process alive just for the scheduler.
  timer.unref?.()

  console.info(`[scheduler] started, tick ${scheduler.tickIntervalMs}ms, concurrency ${scheduler.concurrency}`)
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * Spreads the first check of every monitor over a short window so a restart does
 * not fire every check in the same second.
 */
export function rescheduleAllMonitors(jitterSeconds = 15): void {
  const database = useDatabase()
  const now = nowInSeconds()

  for (const row of database.select({ monitorId: monitorState.monitorId }).from(monitorState).all()) {
    database
      .update(monitorState)
      .set({ nextCheckAt: now + Math.floor(Math.random() * jitterSeconds), updatedAt: now })
      .where(eq(monitorState.monitorId, row.monitorId))
      .run()
  }
}

/** Picks up every monitor whose next check is due and runs it. */
export async function runDueChecks(): Promise<void> {
  const database = useDatabase()
  const { scheduler } = useRuntimeConfig()
  const capacity = scheduler.concurrency - inFlight.size

  if (capacity <= 0) {
    return
  }

  const now = nowInSeconds()
  const due = database
    .select({ monitor: monitors })
    .from(monitors)
    .innerJoin(monitorState, eq(monitorState.monitorId, monitors.id))
    .where(and(
      eq(monitors.active, true),
      or(isNull(monitorState.nextCheckAt), lte(monitorState.nextCheckAt, now))
    ))
    .orderBy(monitorState.nextCheckAt)
    .limit(capacity + inFlight.size)
    .all()
    .map(row => row.monitor)
    .filter(monitor => !inFlight.has(monitor.id))
    .slice(0, capacity)

  await Promise.all(due.map(monitor => runCheck(monitor)))
}

/** Runs a check immediately, bypassing the schedule. Used by the admin UI. */
export async function runCheckNow(monitorId: number): Promise<void> {
  const database = useDatabase()
  const monitor = database.select().from(monitors).where(eq(monitors.id, monitorId)).get()

  if (!monitor) {
    throw createError({ statusCode: 404, statusMessage: 'Monitor not found' })
  }

  await runCheck(monitor)
}

async function runCheck(monitor: MonitorRow): Promise<void> {
  inFlight.add(monitor.id)

  try {
    const result = await executeCheck(monitor)

    // Asked only once the check has already failed, which is the single moment
    // the answer changes anything: a host that lost its uplink fails every check
    // at once, and the result alone cannot tell that from the target being down.
    // Callers share one probe, so a total outage costs one of them, not one per
    // monitor.
    if (result.status === 'down' || isUplinkDown()) {
      await ensureUplinkVerdict()
    }

    const event = recordCheckResult(monitor, result)

    // Queued rather than delivered: the monitor stays in the in-flight set until
    // this returns, so a transport that hangs would stop it being checked again.
    if (event) {
      enqueueNotificationEvent(event)
    }
  } catch (error) {
    console.error(`[scheduler] monitor ${monitor.id} failed:`, error)
  } finally {
    inFlight.delete(monitor.id)
  }
}

/**
 * Persists the heartbeat, advances the monitor state and reports the state
 * transition that a notification provider would care about.
 */
export function recordCheckResult(monitor: MonitorRow, result: CheckResult): NotificationEvent | null {
  const database = useDatabase()
  const now = nowInSeconds()

  // The monitor can be gone by the time a slow check returns: deleting one, or
  // wiping the instance from the settings, does not wait for the in-flight
  // checks. Writing the heartbeat would fail on the foreign key.
  const stillExists = database.select({ id: monitors.id }).from(monitors).where(eq(monitors.id, monitor.id)).get()

  if (!stillExists) {
    return null
  }

  const previous = database.select().from(monitorState).where(eq(monitorState.monitorId, monitor.id)).get()
  const previousStatus = previous?.status ?? 'pending'

  /*
   * Two things withhold judgement, and both freeze the state machine rather than
   * feeding it a different answer: a maintenance window, and the instance having
   * lost its own uplink. The counters, the status and `statusChangedAt` all keep
   * what they held when it started, and three things follow from that alone:
   *
   * - no transition happens, so `buildNotificationEvent` below finds nothing to
   *   report without needing to know about either of them;
   * - a monitor that was up comes out of it with a failure count of zero, so the
   *   retries are counted from the start again — a server that is still booting,
   *   or a router that just came back, gets its full tolerance;
   * - a monitor that was already down and reported stays down underneath, so
   *   the recovery is still delivered when it finally answers again.
   *
   * The heartbeat is written either way and keeps the raw outcome; only its
   * `reportedStatus` says the reading was not judged.
   *
   * A successful check is frozen along with a failed one. It could be judged —
   * a target that answered answered, whatever our own network was doing — but
   * one rule that covers both is worth more than the interval of delay it costs
   * a monitor recovering during the outage.
   */
  const maintenance = resolveMonitorMaintenance(monitor, now)
  // A window wins the label where both apply: it is the one somebody planned,
  // and it is the answer the reader is looking for.
  const withheld: HeartbeatReportedStatus | null = maintenance.active
    ? 'maintenance'
    : shouldWithholdCheckResult() ? 'unknown' : null

  const consecutiveFailures = withheld
    ? previous?.consecutiveFailures ?? 0
    : result.status === 'down' ? (previous?.consecutiveFailures ?? 0) + 1 : 0
  const consecutiveSuccesses = withheld
    ? previous?.consecutiveSuccesses ?? 0
    : result.status === 'up' ? (previous?.consecutiveSuccesses ?? 0) + 1 : 0

  // While retries are left the monitor is "pending" rather than down, which keeps
  // a single blip out of the incident history.
  const status: EvaluatedMonitorStatus = withheld
    ? previousStatus
    : result.status === 'up'
      ? 'up'
      : consecutiveFailures > monitor.retries ? 'down' : 'pending'

  // Returned rather than run: the identifier makes the pushed heartbeat the very
  // same row a later refetch would deliver, so the two can never be drawn twice.
  const heartbeat = database.insert(heartbeats).values({
    monitorId: monitor.id,
    checkedAt: now,
    status: result.status,
    reportedStatus: withheld ?? status,
    latencyMs: result.latencyMs,
    statusCode: result.statusCode,
    message: result.message
  }).returning().get()

  const certificateExpiresAt = result.certificateExpiresAt ?? previous?.certificateExpiresAt ?? null

  const current = database.insert(monitorState).values({
    monitorId: monitor.id,
    status,
    lastCheckedAt: now,
    nextCheckAt: now + monitor.intervalSeconds,
    latencyMs: result.latencyMs,
    message: result.message,
    consecutiveFailures,
    consecutiveSuccesses,
    certificateExpiresAt,
    certificateCheckedAt: result.certificateExpiresAt ? now : previous?.certificateCheckedAt ?? null,
    statusChangedAt: status === previousStatus ? previous?.statusChangedAt ?? now : now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: monitorState.monitorId,
    set: {
      status,
      lastCheckedAt: now,
      nextCheckAt: now + monitor.intervalSeconds,
      latencyMs: result.latencyMs,
      message: result.message,
      consecutiveFailures,
      consecutiveSuccesses,
      certificateExpiresAt,
      certificateCheckedAt: result.certificateExpiresAt ? now : previous?.certificateCheckedAt ?? null,
      statusChangedAt: status === previousStatus ? previous?.statusChangedAt ?? now : now,
      updatedAt: now
    }
  }).returning().get()

  publishCheckResult(monitor, current, heartbeat, maintenance)

  return buildNotificationEvent(monitor, previous, status, previousStatus, result, certificateExpiresAt, now)
}

/**
 * Pushes the result to every connected browser. The payload mirrors the shape
 * the monitor list returns, so a client can patch its cache in place instead of
 * asking for the whole list again.
 */
function publishCheckResult(
  monitor: MonitorRow,
  state: MonitorStateRow,
  heartbeat: HeartbeatRow,
  maintenance: MaintenanceStatus
): void {
  // The uptime is a query of its own, worth skipping while nobody is watching.
  if (!hasLiveListeners()) {
    return
  }

  publishLiveEvent({
    type: 'monitor.checked',
    monitorId: monitor.id,
    state: serializeMonitorState(monitor, state, maintenance),
    uptime24h: calculateUptimeBulk([monitor.id], STATS_RANGE_SECONDS['24h']).get(monitor.id) ?? emptyUptime(),
    heartbeat
  })
}

function buildNotificationEvent(
  monitor: MonitorRow,
  previous: MonitorStateRow | undefined,
  status: EvaluatedMonitorStatus,
  previousStatus: EvaluatedMonitorStatus,
  result: CheckResult,
  certificateExpiresAt: number | null,
  now: number
): NotificationEvent | null {
  const base = {
    monitor: {
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      target: monitorTarget(monitor),
      groupPath: monitorGroupPath(monitor.groupId)
    },
    status,
    message: result.message,
    latencyMs: result.latencyMs,
    occurredAt: now,
    // How long the status being left had held, which is what a message means by
    // "down for 4 minutes".
    durationSeconds: previous?.statusChangedAt ? now - previous.statusChangedAt : null,
    certificateExpiresAt
  }

  if (status === 'down' && previousStatus !== 'down') {
    return { ...base, type: 'monitor.down' }
  }

  if (status === 'up' && previousStatus === 'down') {
    return { ...base, type: 'monitor.up' }
  }

  if (certificateExpiresAt && monitor.checkCertificateExpiry && enteredCertificateWarningWindow(monitor, previous, certificateExpiresAt, now)) {
    return { ...base, type: 'monitor.certificate-expiring' }
  }

  return null
}

/** True only on the check where the certificate first enters the warning window. */
function enteredCertificateWarningWindow(
  monitor: MonitorRow,
  previous: MonitorStateRow | undefined,
  certificateExpiresAt: number,
  now: number
): boolean {
  const window = monitor.certificateExpiryWarningDays * 86_400

  if (certificateExpiresAt > now + window) {
    return false
  }

  const previousExpiry = previous?.certificateExpiresAt
  const previousCheckedAt = previous?.lastCheckedAt

  // Nothing to compare against, so the first reading is reported when it already
  // sits inside the window.
  if (!previousExpiry || !previousCheckedAt) {
    return true
  }

  // The window moves, the expiry does not, so the crossing is only visible
  // against the window as it stood at the previous check. Testing the previous
  // expiry against the *current* threshold asks whether a value is past a bound
  // it was just compared to two lines earlier: false for an unchanged
  // certificate, which is every certificate that ages into its warning window.
  return previousExpiry > previousCheckedAt + window
}

// Kept as a public export for existing callers; the implementation lives in a
// dependency-free utility so services used by the scheduler do not import the
// scheduler back and form a cycle.
export { nowInSeconds }
