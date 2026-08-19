import { sql } from 'drizzle-orm'

/** Liveness probe for Docker and reverse proxies. */
export default defineEventHandler((event) => {
  try {
    useDatabase().get(sql`select 1`)
  } catch (error) {
    setResponseStatus(event, 503)

    return { status: 'error', database: false, message: (error as Error).message }
  }

  return { status: 'ok', database: true }
})
