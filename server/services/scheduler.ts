import { and, eq, isNull, lte, or } from 'drizzle-orm'
import type { MonitorStatus } from '../../shared/types/monitor'
import type { NotificationEvent } from '../../shared/types/notification'
import { monitorTarget } from '../../shared/utils/monitor'
import { STATS_RANGE_SECONDS } from '../../shared/utils/stats'
import { heartbeats, monitorState, monitors } from '../database/schema'
import type { HeartbeatRow, MonitorRow, MonitorStateRow } from '../database/schema'
import { executeCheck } from './checks'
import type { CheckResult } from './checks'
import { dispatchNotificationEvent } from './notifications'

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
    const event = recordCheckResult(monitor, result)

    if (event) {
      await dispatchNotificationEvent(event)
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

  const consecutiveFailures = result.status === 'down' ? (previous?.consecutiveFailures ?? 0) + 1 : 0
  const consecutiveSuccesses = result.status === 'up' ? (previous?.consecutiveSuccesses ?? 0) + 1 : 0

  // While retries are left the monitor is "pending" rather than down, which keeps
  // a single blip out of the incident history.
  const status: MonitorStatus = result.status === 'up'
    ? 'up'
    : consecutiveFailures > monitor.retries ? 'down' : 'pending'

  // Returned rather than run: the identifier makes the pushed heartbeat the very
  // same row a later refetch would deliver, so the two can never be drawn twice.
  const heartbeat = database.insert(heartbeats).values({
    monitorId: monitor.id,
    checkedAt: now,
    status: result.status,
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

  publishCheckResult(monitor, current, heartbeat)

  return buildNotificationEvent(monitor, previous, status, previousStatus, result, certificateExpiresAt, now)
}

/**
 * Pushes the result to every connected browser. The payload mirrors the shape
 * the monitor list returns, so a client can patch its cache in place instead of
 * asking for the whole list again.
 */
function publishCheckResult(monitor: MonitorRow, state: MonitorStateRow, heartbeat: HeartbeatRow): void {
  // The uptime is a query of its own, worth skipping while nobody is watching.
  if (!hasLiveListeners()) {
    return
  }

  publishLiveEvent({
    type: 'monitor.checked',
    monitorId: monitor.id,
    state: serializeMonitorState(monitor, state),
    uptime24h: calculateUptimeBulk([monitor.id], STATS_RANGE_SECONDS['24h']).get(monitor.id) ?? emptyUptime(),
    heartbeat
  })
}

function buildNotificationEvent(
  monitor: MonitorRow,
  previous: MonitorStateRow | undefined,
  status: MonitorStatus,
  previousStatus: MonitorStatus,
  result: CheckResult,
  certificateExpiresAt: number | null,
  now: number
): NotificationEvent | null {
  const base = {
    monitor: { id: monitor.id, name: monitor.name, type: monitor.type, target: monitorTarget(monitor) },
    status,
    message: result.message,
    latencyMs: result.latencyMs,
    occurredAt: now
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
  const threshold = now + monitor.certificateExpiryWarningDays * 86_400

  if (certificateExpiresAt > threshold) {
    return false
  }

  const previousExpiry = previous?.certificateExpiresAt

  return !previousExpiry || previousExpiry > threshold
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
