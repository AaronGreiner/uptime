import type { MaintenanceAssignment, MaintenanceStatus } from './maintenance'
import type { NotificationMode } from './notification'

/** Kinds of checks the scheduler knows how to execute. */
export type MonitorType = 'http' | 'ping'

/**
 * Status as the state machine establishes and stores it.
 *
 * Neither `paused` nor `maintenance` is in here, and that is the invariant the
 * whole feature rests on: both are decided when the row is *read*, from the
 * monitor's `active` flag and from the windows, so the stored value keeps
 * saying what the checks last established underneath a window rather than being
 * overwritten by it.
 */
export type EvaluatedMonitorStatus = 'up' | 'down' | 'pending'

/**
 * Status as the interface shows it: what the checks established, or one of the
 * two states in which no result is being judged. `paused` means the monitor is
 * disabled, `maintenance` that a window is open over it.
 */
export type MonitorStatus = EvaluatedMonitorStatus | 'paused' | 'maintenance'

/** Outcome of a single executed check. Never `pending` or `paused`. */
export type HeartbeatStatus = 'up' | 'down'

/**
 * Monitor status reported after a check. A tolerated failure is `pending`, and
 * a check that ran inside a maintenance window is `maintenance` — which is what
 * the uptime and incident queries filter on, while `status` next to it keeps the
 * raw truth about whether the target answered.
 */
export type HeartbeatReportedStatus = EvaluatedMonitorStatus | 'maintenance'

export interface MonitorHttpOptions {
  url: string
  method: string
  /** Serialised as JSON in the database, exposed as a record. */
  headers: Record<string, string>
  body: string | null
  /** Comma separated list of codes and ranges, e.g. `200-299,301`. */
  expectedStatusCodes: string
  keyword: string | null
  /** When true the keyword must be absent for the check to pass. */
  keywordInverted: boolean
  followRedirects: boolean
  ignoreTls: boolean
  checkCertificateExpiry: boolean
  certificateExpiryWarningDays: number
}

export interface MonitorPingOptions {
  hostname: string
  packetCount: number
}

export interface NotificationAssignment {
  /** Where this record takes its notification groups from. */
  notificationMode: NotificationMode
  /** Groups assigned directly; only consulted while the mode is `custom`. */
  notificationGroupIds: number[]
}

export interface Monitor extends MonitorHttpOptions, MonitorPingOptions, NotificationAssignment, MaintenanceAssignment {
  id: number
  name: string
  icon: string | null
  type: MonitorType
  description: string | null
  /** Group the monitor belongs to, or null when it sits at the tree root. */
  groupId: number | null
  intervalSeconds: number
  timeoutSeconds: number
  /** Consecutive failures tolerated before the monitor is reported as down. */
  retries: number
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface MonitorState {
  status: MonitorStatus
  lastCheckedAt: number | null
  nextCheckAt: number | null
  latencyMs: number | null
  message: string | null
  consecutiveFailures: number
  consecutiveSuccesses: number
  /** Unix seconds at which the TLS certificate expires, if known. */
  certificateExpiresAt: number | null
  /** Unix seconds of the last status change, used for `up since` labels. */
  statusChangedAt: number | null
  /**
   * Maintenance as the server resolved it when the payload was built. The
   * browser recomputes the same answer against the shared clock, so a window
   * opens and closes without a request; this is what makes the first render and
   * every non-browser consumer agree with it.
   */
  maintenance: MaintenanceStatus
}

export interface Heartbeat {
  id: number
  monitorId: number
  checkedAt: number
  /** Raw check outcome used by uptime and incident calculations. */
  status: HeartbeatStatus
  /** User-facing monitor status after applying the retry threshold. */
  reportedStatus: HeartbeatReportedStatus
  latencyMs: number | null
  statusCode: number | null
  message: string | null
}

export interface MonitorUptime {
  /** Ratio between 0 and 1, or null when no data exists for the range. */
  ratio: number | null
  upCount: number
  downCount: number
  avgLatencyMs: number | null
}

export interface MonitorWithState extends Monitor {
  state: MonitorState
  uptime24h: MonitorUptime
  recentHeartbeats: Heartbeat[]
}

/** One day of an uptime calendar, aligned to the viewer's midnight. */
export interface MonitorDailyPoint {
  dayStart: number
  upCount: number
  downCount: number
  /** Checks that ran under maintenance, counted out of the two above. */
  maintenanceCount: number
  avgLatencyMs: number | null
}

/** A single point of the latency/uptime chart, aligned to a bucket start. */
export interface MonitorStatsPoint {
  bucketStart: number
  upCount: number
  downCount: number
  /** Checks that ran under maintenance, counted out of the two above. */
  maintenanceCount: number
  avgLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
}

/**
 * How the response time chart draws its readings. `average` is the average
 * alone; the other three add the spread of the checks inside each bucket, which
 * is not a series of its own but the range its two bounds enclose — `band`
 * fills it and draws both edges, `ticks` gives every bucket its own stroke and
 * invents nothing between two of them, `neutral` takes the fill out of the
 * primary colour so the average keeps it to itself.
 */
export type LatencyChartStyle = 'average' | 'band' | 'ticks' | 'neutral'
