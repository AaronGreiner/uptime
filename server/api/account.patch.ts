import { eq } from 'drizzle-orm'
import { users } from '../database/schema'
import { accountUpdateSchema } from '../../shared/utils/validation'

/** Lets the admin rotate username and password without touching the environment. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)

  if (!useRuntimeConfig(event).public.accountUpdatesEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'Account updates are disabled' })
  }

  const body = await readValidatedBody(event, accountUpdateSchema.parse)
  const database = useDatabase()
  const user = database.select().from(users).where(eq(users.id, admin.id)).get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'Account not found' })
  }

  if (!await verifyPassword(user.passwordHash, body.currentPassword)) {
    throw createError({ statusCode: 403, statusMessage: 'The current password is incorrect' })
  }

  const taken = database.select({ id: users.id }).from(users).where(eq(users.username, body.username)).get()

  if (taken && taken.id !== user.id) {
    throw createError({ statusCode: 409, statusMessage: 'This username is already taken' })
  }

  database.update(users).set({
    username: body.username,
    passwordHash: body.newPassword ? await hashPassword(body.newPassword) : user.passwordHash,
    updatedAt: Math.floor(Date.now() / 1000)
  }).where(eq(users.id, user.id)).run()

  await setUserSession(event, {
    user: { id: user.id, username: body.username },
    loggedInAt: Math.floor(Date.now() / 1000)
  })

  return { user: { id: user.id, username: body.username } }
})
