import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../database/schema'

export type Database = ReturnType<typeof createDatabase>

let instance: Database | null = null

function createDatabase(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true })

  const connection = new SqliteDatabase(filePath)

  // WAL keeps the scheduler writing while dashboards read.
  connection.pragma('journal_mode = WAL')
  connection.pragma('synchronous = NORMAL')
  connection.pragma('foreign_keys = ON')
  connection.pragma('busy_timeout = 5000')

  return drizzle(connection, { schema })
}

function resolvePath(value: string) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

/**
 * Returns the shared connection. The first call opens the file, so migrations
 * must have run before any request is served (see the database nitro plugin).
 */
export function useDatabase(): Database {
  if (!instance) {
    instance = createDatabase(resolvePath(useRuntimeConfig().databasePath))
  }

  return instance
}

/** Applies pending drizzle-kit migrations. Safe to call on every boot. */
export function migrateDatabase(): void {
  const config = useRuntimeConfig()
  const migrationsFolder = resolvePath(config.migrationsDir)

  if (!existsSync(migrationsFolder)) {
    throw new Error(
      `Migrations folder not found at "${migrationsFolder}". `
      + 'Run "pnpm db:generate" during development or make sure the drizzle folder '
      + 'is shipped next to the server output and NUXT_MIGRATIONS_DIR points at it.'
    )
  }

  migrate(useDatabase(), { migrationsFolder })
}

export { schema }
