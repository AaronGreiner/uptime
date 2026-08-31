/**
 * A recurring window during which a monitor's results are recorded but not
 * judged. Weekdays are a bitmask so a whole schedule is one integer column, and
 * the times are minutes from local midnight rather than timestamps: the window
 * is a rule about the clock on the wall, which is what survives a DST change.
 */
export interface MaintenanceWindow {
  id: number
  /**
   * A free remark, not a label. A window is recognised by its rhythm, its time
   * and what it covers, and all three are on screen wherever it is listed — a
   * name would only be a second identity to keep in step with the first.
   */
  note: string | null
  /** Set when the window covers a single monitor. */
  monitorId: number | null
  /** Set when it covers a node of the tree, and everything below it. */
  monitorGroupId: number | null
  /** Bitmask, bit 0 is Sunday through bit 6 is Saturday. */
  weekdays: number
  /** Minutes from local midnight, 0 to 1439. */
  startMinute: number
  /** Length of the window in minutes, up to a full day. */
  durationMinutes: number
  enabled: boolean
}

/**
 * The manual switch, carried by monitors and by monitor groups alike.
 *
 * `startedAt` is what says whether it is on at all; `until` being null while it
 * is on means "until somebody turns it off", which is why the two cannot be
 * collapsed into a single nullable timestamp.
 */
export interface MaintenanceOverride {
  maintenanceStartedAt: number | null
  maintenanceUntil: number | null
}

/** Everything one record contributes to the maintenance decision. */
export interface MaintenanceAssignment extends MaintenanceOverride {
  maintenanceWindows: MaintenanceWindow[]
}

/**
 * A group as the walk up the tree sees it: what it contributes, plus where the
 * walk continues from it.
 */
export interface MaintenanceNode extends MaintenanceAssignment {
  parentId: number | null
}

/**
 * The resolved answer for one monitor at one instant.
 *
 * `until` is null both when nothing is running and when what runs is open
 * ended, so `active` is the flag to read; `until` only ever qualifies it.
 */
export interface MaintenanceStatus {
  active: boolean
  /** Unix seconds the running maintenance ends at, null when open ended. */
  until: number | null
  /** Unix seconds the manual switch was flipped, when that is what is running. */
  since: number | null
  /** True when a manual override is holding the monitor in maintenance. */
  manual: boolean
  /** True when a scheduled window is open, whatever the manual switch says. */
  scheduled: boolean
}
