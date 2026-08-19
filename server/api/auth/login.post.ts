import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'
import { loginSchema } from '../../../shared/utils/validation'

export default defineEventHandler(async (event) => {
  const { username, password } = await readValidatedBody(event, loginSchema.parse)
  const user = useDatabase().select().from(users).where(eq(users.username, username)).get()

  if (!user) {
    // Burn a comparable amount of time so an unknown username cannot be told
    // apart from a wrong password by response timing alone.
    await hashPassword(password)

    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  if (!await verifyPassword(user.passwordHash, password)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await setUserSession(event, {
    user: { id: user.id, username: user.username },
    loggedInAt: Math.floor(Date.now() / 1000)
  })

  return { user: { id: user.id, username: user.username } }
})
