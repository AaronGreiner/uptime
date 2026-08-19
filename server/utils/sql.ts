import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

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
