import type { NotificationMode } from './notification'

/** Kinds of checks the scheduler knows how to execute. */
export type MonitorType = 'http' | 'ping'

/** Result of the latest check, or `paused` when the monitor is disabled. */
export type MonitorStatus = 'up' | 'down' | 'pending' | 'paused'

/** Outcome of a single executed check. Never `pending` or `paused`. */
export type HeartbeatStatus = 'up' | 'down'

/** Monitor status reported after a check. A tolerated failure is `pending`. */
export type HeartbeatReportedStatus = Exclude<MonitorStatus, 'paused'>

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

export interface Monitor extends MonitorHttpOptions, MonitorPingOptions, NotificationAssignment {
  id: number
  name: string
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
  avgLatencyMs: number | null
}

/** A single point of the latency/uptime chart, aligned to a bucket start. */
export interface MonitorStatsPoint {
  bucketStart: number
  upCount: number
  downCount: number
  avgLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
}

/**
 * A curve the response time chart can draw from those buckets. The average is
 * the reading itself; the two bounds are the spread of the checks inside a
 * bucket rather than series of their own, which is why they are drawn as a band.
 */
export type LatencySeries = 'min' | 'avg' | 'max'

/**
 * How the spread between the two bounds is drawn. `band` fills it and draws
 * both edges, `ticks` gives every bucket its own stroke and invents nothing
 * between two of them, `neutral` takes the fill out of the primary colour so
 * the average keeps it to itself.
 */
export type LatencySpread = 'band' | 'ticks' | 'neutral'
