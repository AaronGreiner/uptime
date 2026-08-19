import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { WidgetType } from '../../shared/types/dashboard'
import { buildDefaultWidgetLayout } from '../../shared/utils/grid'
import { dashboards, dashboardWidgets, heartbeats, monitors, monitorState, users } from '../database/schema'
import { aggregateHourlyStats } from './maintenance'
import { nowInSeconds } from './scheduler'

/**
 * Creates the single admin account on an empty database.
 *
 * When no password is configured a random one is generated and printed once, so
 * a fresh container is never reachable with a predictable default.
 */
export async function seedAdminUser(): Promise<void> {
  const database = useDatabase()
  const existing = database.select({ id: users.id }).from(users).limit(1).all()

  if (existing.length) {
    return
  }

  const { admin } = useRuntimeConfig()
  const username = admin.username.trim() || 'admin'
  const generated = !admin.password
  const password = admin.password || randomBytes(12).toString('base64url')
  const now = nowInSeconds()

  database.insert(users).values({
    username,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  }).run()

  if (generated) {
    console.warn(
      '\n[uptime] Created the admin account with a generated password.\n'
      + `[uptime]   username: ${username}\n`
      + `[uptime]   password: ${password}\n`
      + '[uptime] Store it now, it is not shown again. Set NUXT_ADMIN_PASSWORD to choose your own.\n'
    )
  } else {
    console.info(`[uptime] Created the admin account "${username}" from the environment.`)
  }
}

/** Guarantees that the app always has a dashboard to land on. */
export function seedDefaultDashboard(): void {
  const database = useDatabase()
  const existing = database.select({ id: dashboards.id }).from(dashboards).limit(1).all()

  if (existing.length) {
    return
  }

  const now = nowInSeconds()

  database.insert(dashboards).values({
    slug: 'overview',
    name: 'Overview',
    description: null,
    isDefault: true,
    position: 0,
    createdAt: now,
    updatedAt: now
  }).run()
}

interface DemoMonitor {
  name: string
  type: 'http' | 'ping'
  url?: string
  hostname?: string
  description: string
  /** Probability that a generated heartbeat is a failure. */
  failureRate: number
  baseLatency: number
}

const DEMO_MONITORS: DemoMonitor[] = [
  { name: 'Nuxt', type: 'http', url: 'https://nuxt.com', description: 'Public website', failureRate: 0.004, baseLatency: 120 },
  { name: 'GitHub API', type: 'http', url: 'https://api.github.com', description: 'REST API endpoint', failureRate: 0.01, baseLatency: 210 },
  { name: 'Cloudflare DNS', type: 'ping', hostname: '1.1.1.1', description: 'ICMP reachability', failureRate: 0.002, baseLatency: 14 },
  { name: 'Example Service', type: 'http', url: 'https://example.com', description: 'Flaky demo service', failureRate: 0.08, baseLatency: 340 }
]

/**
 * Populates the database with demo monitors, a pre-built dashboard and synthetic
 * history. Controlled by NUXT_SEED_DEMO_DATA and only ever runs once.
 *
 * The demo monitors point at real, public endpoints, so enabling this makes the
 * scheduler send actual requests to those hosts.
 */
export function seedDemoData(): void {
  const database = useDatabase()

  if (getSetting(SETTING_KEYS.demoSeeded, false)) {
    return
  }

  const existing = database.select({ id: monitors.id }).from(monitors).limit(1).all()

  if (existing.length) {
    console.info('[seed] Skipping demo data, the database already contains monitors.')
    setSetting(SETTING_KEYS.demoSeeded, true)
    return
  }

  const { seed } = useRuntimeConfig()
  const now = nowInSeconds()
  const created: Array<{ id: number, demo: DemoMonitor }> = []

  for (const demo of DEMO_MONITORS) {
    const row = database.insert(monitors).values({
      name: demo.name,
      type: demo.type,
      description: demo.description,
      url: demo.url ?? '',
      hostname: demo.hostname ?? '',
      intervalSeconds: 60,
      timeoutSeconds: 10,
      retries: 1,
      active: true,
      createdAt: now,
      updatedAt: now
    }).returning({ id: monitors.id }).get()

    created.push({ id: row.id, demo })
  }

  generateDemoHistory(created, seed.demoHistoryDays)
  buildDemoDashboard(created.map(entry => entry.id), now)

  aggregateHourlyStats()
  setSetting(SETTING_KEYS.demoSeeded, true)

  console.info(`[seed] Created ${created.length} demo monitors with ${seed.demoHistoryDays} days of generated history.`)
}

/** Writes synthetic heartbeats so charts have something to show immediately. */
function generateDemoHistory(created: Array<{ id: number, demo: DemoMonitor }>, days: number): void {
  const database = useDatabase()
  const now = nowInSeconds()
  const stepSeconds = 300
  const steps = Math.max(0, Math.round(days * 86_400 / stepSeconds))

  database.transaction((transaction) => {
    for (const { id, demo } of created) {
      let outageRemaining = 0
      let lastStatus: 'up' | 'down' = 'up'
      let lastLatency: number | null = demo.baseLatency

      for (let step = steps; step > 0; step--) {
        const checkedAt = now - step * stepSeconds

        if (outageRemaining > 0) {
          outageRemaining--
        } else if (Math.random() < demo.failureRate) {
          outageRemaining = 1 + Math.floor(Math.random() * 4)
        }

        const isDown = outageRemaining > 0
        // A daily sine wave plus noise makes the latency chart look plausible.
        const timeOfDay = (checkedAt % 86_400) / 86_400
        const wave = Math.sin(timeOfDay * Math.PI * 2) * demo.baseLatency * 0.2
        const noise = (Math.random() - 0.5) * demo.baseLatency * 0.3
        const latency = Math.max(1, Math.round(demo.baseLatency + wave + noise))

        lastStatus = isDown ? 'down' : 'up'
        lastLatency = isDown ? null : latency

        transaction.insert(heartbeats).values({
          monitorId: id,
          checkedAt,
          status: lastStatus,
          latencyMs: lastLatency,
          statusCode: demo.type === 'http' ? (isDown ? 503 : 200) : null,
          message: isDown
            ? (demo.type === 'http' ? 'HTTP 503, expected 200-299' : '100% packet loss')
            : (demo.type === 'http' ? 'HTTP 200' : '3/3 replies')
        }).run()
      }

      transaction.insert(monitorState).values({
        monitorId: id,
        status: lastStatus,
        lastCheckedAt: now,
        nextCheckAt: now + Math.floor(Math.random() * 20),
        latencyMs: lastLatency,
        message: lastStatus === 'up' ? 'HTTP 200' : 'Generated outage',
        consecutiveFailures: lastStatus === 'down' ? 1 : 0,
        consecutiveSuccesses: lastStatus === 'up' ? 1 : 0,
        statusChangedAt: now,
        updatedAt: now
      }).onConflictDoNothing().run()
    }
  })
}

/** Lays out a demo dashboard mixing every widget type. */
function buildDemoDashboard(monitorIds: number[], now: number): void {
  const database = useDatabase()
  const dashboard = database.insert(dashboards).values({
    slug: 'demo',
    name: 'Demo',
    description: 'Generated dashboard showcasing the available widgets',
    isDefault: false,
    position: 1,
    createdAt: now,
    updatedAt: now
  }).returning({ id: dashboards.id }).get()

  const insertWidget = (type: WidgetType, x: number, y: number, monitorId: number | null, config: Record<string, unknown>) => {
    database.insert(dashboardWidgets).values({
      dashboardId: dashboard.id,
      type,
      monitorId,
      config,
      layout: buildDefaultWidgetLayout(type, x, y),
      createdAt: now,
      updatedAt: now
    }).run()
  }

  insertWidget('status-overview', 0, 0, null, {})

  monitorIds.forEach((monitorId, index) => {
    insertWidget('monitor', (index % 3) * 4, 3 + Math.floor(index / 3) * 4, monitorId, { heartbeatCount: 40 })
  })

  const chartRow = 3 + Math.ceil(monitorIds.length / 3) * 4

  if (monitorIds[0]) {
    insertWidget('latency-chart', 0, chartRow, monitorIds[0], { range: '24h' })
  }

  if (monitorIds[1]) {
    insertWidget('uptime-summary', 6, chartRow, monitorIds[1], { range: '7d' })
  }
}

/** Drops every demo artefact again, used by the reset endpoint. */
export function clearDemoData(): void {
  const database = useDatabase()

  database.transaction((transaction) => {
    transaction.delete(monitors).run()
    transaction.run(sql`delete from dashboards where slug = 'demo'`)
  })

  setSetting(SETTING_KEYS.demoSeeded, false)
}
