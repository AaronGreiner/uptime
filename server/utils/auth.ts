import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { User } from '#auth-utils'
import { users } from '../database/schema'

/**
 * Guards every mutating endpoint. Read endpoints stay public on purpose - the
 * dashboards are meant to be shareable without an account.
 *
 * The account is re-read from the database rather than trusted from the cookie
 * alone, so a session cannot outlive the account it belongs to.
 */
export async function requireAdmin(event: H3Event): Promise<User> {
  const { user } = await requireUserSession(event)
  const account = useDatabase()
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, user.id))
    .get()

  if (!account) {
    await clearUserSession(event)

    throw createError({ statusCode: 401, statusMessage: 'Session is no longer valid' })
  }

  return account
}
