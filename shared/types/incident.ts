/**
 * A run of failed checks on one monitor. Incidents are not stored: they are
 * derived from the heartbeats, or from the hourly rollups once those heartbeats
 * have been pruned.
 */
export interface Incident {
  monitorId: number
  /** Unix seconds of the first failed check. */
  startedAt: number
  /** Unix seconds of the first successful check after it, null while ongoing. */
  endedAt: number | null
  /** Failed checks the outage consists of. */
  checks: number
  /** Result of the first failed check, absent on a reconstructed incident. */
  message: string | null
  /**
   * True when the outage was reconstructed from hourly rollups, which resolve
   * its boundaries to the hour rather than to the check.
   */
  approximate: boolean
}

/** Reliability figures over the requested window. */
export interface IncidentSummary {
  count: number
  /** Outages still running at the end of the window. */
  ongoing: number
  totalDownSeconds: number
  longestSeconds: number | null
  /** Mean time to recovery over the finished outages. */
  mttrSeconds: number | null
  /** Window uptime divided by the number of outages. */
  mtbfSeconds: number | null
}
