import type { HeartbeatStatus } from '../../../shared/types/monitor'
import type { MonitorRow } from '../../database/schema'

export interface CheckResult {
  status: HeartbeatStatus
  /** Round trip time in milliseconds, null when the check never connected. */
  latencyMs: number | null
  statusCode: number | null
  /** Short, human readable outcome shown in the UI and in notifications. */
  message: string
  /** Unix seconds, only set when a TLS certificate was inspected. */
  certificateExpiresAt?: number | null
}

export type CheckExecutor = (monitor: MonitorRow) => Promise<CheckResult>
