import type {
  MaintenanceAssignment,
  MaintenanceNode,
  MaintenanceOverride,
  MaintenanceStatus,
  MaintenanceWindow
} from '../types/maintenance'

/** Zone the windows are read in until an admin picks another one. */
export const MAINTENANCE_DEFAULT_TIME_ZONE = 'Europe/Berlin'

export const MINUTES_PER_DAY = 1440

export const MAINTENANCE_WINDOW_BOUNDS = {
  duration: { min: 1, max: MINUTES_PER_DAY },
  start: { min: 0, max: MINUTES_PER_DAY - 1 }
}

/** Every weekday selected, which is what a nightly reboot needs. */
export const WEEKDAY_MASK_ALL = 0b111_1111

/** Monday to Friday, the other schedule people reach for. */
export const WEEKDAY_MASK_WEEKDAYS = 0b011_1110

/**
 * Weekday order used by the bitmask: bit 0 is Sunday, matching
 * `Date.getDay()` and the `weekday` part `Intl` reports. The interface renders
 * them starting on Monday; only the storage is Sunday first.
 */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type WeekdayKey = typeof WEEKDAY_KEYS[number]

/** Weekday indices in the order the interface offers them. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export function hasWeekday(mask: number, weekday: number): boolean {
  return (mask & (1 << weekday)) !== 0
}

export function toggleWeekday(mask: number, weekday: number): number {
  return mask ^ (1 << weekday)
}

/**
 * Wall clock reading of an instant in a zone.
 *
 * `Intl` is the whole implementation on purpose: asking it for the local
 * weekday and time of `now` is the only question a window ever poses, and it
 * answers it across a DST change without any offset arithmetic of our own.
 */
export interface ZonedClock {
  weekday: number
  minuteOfDay: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)

  if (cached) {
    return cached
  }

  // `hourCycle: 'h23'` rather than `hour12: false`, which reports midnight as
  // hour 24 in several engines and would push every window a day forward.
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }

  let formatter: Intl.DateTimeFormat

  try {
    formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone })
  } catch {
    // An unknown zone falls back to the host's own rather than throwing inside
    // a check: a wrong hour is recoverable, a scheduler that dies is not.
    formatter = new Intl.DateTimeFormat('en-US', options)
  }

  formatters.set(timeZone, formatter)

  return formatter
}

export function zonedClock(seconds: number, timeZone: string): ZonedClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(seconds * 1000))
  let weekday = 0
  let hour = 0
  let minute = 0

  for (const part of parts) {
    if (part.type === 'weekday') {
      weekday = WEEKDAY_INDEX[part.value] ?? 0
    } else if (part.type === 'hour') {
      hour = Number(part.value) % 24
    } else if (part.type === 'minute') {
      minute = Number(part.value)
    }
  }

  return { weekday, minuteOfDay: hour * 60 + minute }
}

/**
 * Minutes a window still has to run, or null when it is not open.
 *
 * A window may start before midnight and reach past it, so the reading is tried
 * against today's occurrence and against yesterday's. Nothing longer than a day
 * can be stored, which is what bounds that to two attempts.
 */
export function windowRemainingMinutes(window: MaintenanceWindow, clock: ZonedClock): number | null {
  if (!window.enabled || window.weekdays === 0 || window.durationMinutes <= 0) {
    return null
  }

  for (const dayOffset of [0, 1]) {
    const startDay = (clock.weekday - dayOffset + 7) % 7

    if (!hasWeekday(window.weekdays, startDay)) {
      continue
    }

    const elapsed = clock.minuteOfDay + dayOffset * MINUTES_PER_DAY - window.startMinute

    if (elapsed >= 0 && elapsed < window.durationMinutes) {
      return window.durationMinutes - elapsed
    }
  }

  return null
}

/** Whether one window is open at an instant, for a list that draws each row. */
export function isWindowOpen(window: MaintenanceWindow, seconds: number, timeZone: string): boolean {
  return windowRemainingMinutes(window, zonedClock(seconds, timeZone)) !== null
}

/** True while the manual switch is on and has not run out. */
export function isOverrideActive(override: MaintenanceOverride, now: number): boolean {
  if (override.maintenanceStartedAt === null) {
    return false
  }

  return override.maintenanceUntil === null || override.maintenanceUntil > now
}

const INACTIVE: MaintenanceStatus = {
  active: false,
  until: null,
  since: null,
  manual: false,
  scheduled: false
}

/**
 * Resolves the chain of records that can put a monitor into maintenance: the
 * monitor itself, then its group, that group's parent, and so on.
 *
 * Unlike the notification assignment nothing here overrides anything — the
 * sources add up, so a window on a root group and one on a single monitor both
 * count. Suppressing an alarm is not a decision that competes with another.
 *
 * The end is the latest of everything currently running, and an open ended
 * manual switch has no end at all: maintenance is over once the last reason for
 * it is.
 */
export function resolveMaintenance(
  chain: readonly MaintenanceAssignment[],
  now: number,
  timeZone: string,
  clock: ZonedClock = zonedClock(now, timeZone)
): MaintenanceStatus {
  let active = false
  let manual = false
  let scheduled = false
  let since: number | null = null
  let until: number | null = null
  let openEnded = false

  for (const source of chain) {
    if (isOverrideActive(source, now)) {
      active = true
      manual = true

      if (source.maintenanceStartedAt !== null && (since === null || source.maintenanceStartedAt < since)) {
        since = source.maintenanceStartedAt
      }

      if (source.maintenanceUntil === null) {
        openEnded = true
      } else if (until === null || source.maintenanceUntil > until) {
        until = source.maintenanceUntil
      }
    }

    for (const window of source.maintenanceWindows) {
      const remaining = windowRemainingMinutes(window, clock)

      if (remaining === null) {
        continue
      }

      active = true
      scheduled = true

      // Counted forward from now rather than from the window's start, so a DST
      // jump inside a window shortens or lengthens it exactly as the wall clock
      // says it should.
      const end = now + remaining * 60

      if (until === null || end > until) {
        until = end
      }
    }
  }

  if (!active) {
    return INACTIVE
  }

  return { active, until: openEnded ? null : until, since, manual, scheduled }
}

/**
 * The records that can put a monitor into maintenance, nearest first: the
 * monitor itself, then its group, that group's parent, and so on.
 *
 * `nodeOf` is a parameter rather than a map so both sides can supply what they
 * already hold — the server its rows joined to the windows table, the browser
 * the group cache, whose entries carry their windows already. The walk itself
 * is shared, which is what makes the interface preview exactly what the
 * scheduler will do.
 */
export function maintenanceChain(
  monitor: MaintenanceAssignment & { groupId: number | null },
  nodeOf: (groupId: number) => MaintenanceNode | undefined
): MaintenanceAssignment[] {
  const chain: MaintenanceAssignment[] = [monitor]
  const seen = new Set<number>()
  let current = monitor.groupId

  // `seen` guards a cycle the API cannot create but a hand-edited database can,
  // so a bad row costs a window rather than the process.
  while (current !== null && !seen.has(current)) {
    seen.add(current)

    const node = nodeOf(current)

    if (!node) {
      break
    }

    chain.push(node)
    current = node.parentId
  }

  return chain
}

/** Days ahead the search for the next window gives up after. */
const NEXT_WINDOW_HORIZON_DAYS = 8

/**
 * When the next occurrence of these windows begins, or null when none is due
 * within a week.
 *
 * A window is a rule about the wall clock, and turning a wall clock time back
 * into an instant is the direction `Intl` does not offer. So the search walks
 * forward a day at a time, reads the clock at each step and shifts by the
 * difference in minutes. That is exact except on the two days a year a zone
 * changes offset inside the shift, where the answer is an hour out — which is
 * within the resolution of the relative label it feeds ("in 14 hours").
 *
 * A window that is open right now is not "next": it has already begun.
 */
export function nextWindowStart(
  windows: readonly MaintenanceWindow[],
  now: number,
  timeZone: string
): number | null {
  let earliest: number | null = null

  for (let dayOffset = 0; dayOffset < NEXT_WINDOW_HORIZON_DAYS; dayOffset += 1) {
    const at = now + dayOffset * 86_400
    const clock = zonedClock(at, timeZone)

    for (const window of windows) {
      if (!window.enabled || window.weekdays === 0 || !hasWeekday(window.weekdays, clock.weekday)) {
        continue
      }

      const start = at + (window.startMinute - clock.minuteOfDay) * 60

      if (start > now && (earliest === null || start < earliest)) {
        earliest = start
      }
    }

    // Every window of a later day starts later than one already found today.
    if (earliest !== null && earliest <= at + 86_400) {
      return earliest
    }
  }

  return earliest
}

/** Durations the manual switch offers, in seconds. Null is "until revoked". */
export const MAINTENANCE_MANUAL_DURATIONS: Array<number | null> = [
  1 * 3600,
  4 * 3600,
  8 * 3600,
  24 * 3600,
  null
]

/**
 * How long an open ended manual maintenance may run before the interface starts
 * warning about it. A forgotten switch makes a monitor blind, and the only
 * moment that becomes obvious is the outage it swallows.
 */
export const MAINTENANCE_STALE_SECONDS = 24 * 3600

export function isMaintenanceStale(status: MaintenanceStatus, now: number): boolean {
  return status.active && status.until === null && status.since !== null
    && now - status.since >= MAINTENANCE_STALE_SECONDS
}

export function isTimeZoneName(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })

    return true
  } catch {
    return false
  }
}
