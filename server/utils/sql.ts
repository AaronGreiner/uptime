import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { UNJUDGED_REPORTED_STATUSES } from '../../shared/utils/monitor'

/**
 * `('maintenance', 'unknown')` — the reported statuses whose readings were
 * recorded but not judged, as an `in` list.
 *
 * Assembled from the shared list rather than spelled out at each call site, so a
 * further reason to withhold judgement reaches the uptime, the latency chart,
 * the calendar and the incident reconstruction in one edit. Raw rather than
 * bound because the values are this module's own constants; nothing from a
 * request ever reaches it.
 */
export const unjudgedStatuses: SQL = sql.raw(
  `(${UNJUDGED_REPORTED_STATUSES.map(status => `'${status}'`).join(', ')})`
)

/**
 * Inlines a number as an SQL integer literal.
 *
 * A bound parameter carries no type affinity in SQLite, so `column / ?` is
 * evaluated as floating point division even when both operands are integers.
 * Bucket maths depends on integer division, hence the literal. Only ever call
 * this with internal constants, never with request data.
 */
export function integerLiteral(value: number): SQL {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Expected a positive integer, received ${value}`)
  }

  return sql.raw(String(value))
}

/**
 * The same for a value that may be negative or zero, such as a UTC offset.
 * Wrapped in parentheses so it can be added to a column without ambiguity.
 */
export function signedIntegerLiteral(value: number): SQL {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Expected an integer, received ${value}`)
  }

  return sql.raw(`(${value})`)
}
