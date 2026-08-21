import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import type { WidgetConfig, WidgetHeight, WidgetType, WidgetWidth } from '../../shared/types/dashboard'
import { dashboards, dashboardWidgets, heartbeats, monitorGroups, monitors, monitorState, notificationChannels, settings, users } from '../database/schema'
import { aggregateHourlyStats } from './maintenance'
import { nowInSeconds } from './scheduler'

/** Slug of the dashboard that both the default seed and the demo seed fill. */
const OVERVIEW_SLUG = 'overview'

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
    slug: OVERVIEW_SLUG,
    name: 'Overview',
    description: null,
    isDefault: true,
    position: 0,
    createdAt: now,
    updatedAt: now
  }).run()
}

interface DemoGroup {
  /** Referenced by the monitors and by the child groups below. */
  key: string
  name: string
  icon: string
  description?: string
  parent?: string
}

/**
 * Three levels deep on the production branch, which is what makes the tree in
 * the sidebar worth looking at.
 */
const DEMO_GROUPS: DemoGroup[] = [
  { key: 'production', name: 'Production', icon: 'i-lucide-rocket', description: 'Everything customers touch' },
  { key: 'production/web', name: 'Web', icon: 'i-lucide-globe', parent: 'production' },
  { key: 'production/api', name: 'APIs', icon: 'i-lucide-webhook', parent: 'production' },
  { key: 'production/docs', name: 'Documentation', icon: 'i-lucide-book-open', parent: 'production' },
  { key: 'infrastructure', name: 'Infrastructure', icon: 'i-lucide-server', description: 'Network and edge' },
  { key: 'infrastructure/dns', name: 'DNS', icon: 'i-lucide-network', parent: 'infrastructure' },
  { key: 'infrastructure/edge', name: 'Edge', icon: 'i-lucide-shield', parent: 'infrastructure' },
  { key: 'staging', name: 'Staging', icon: 'i-lucide-flask-conical', description: 'Preview environment, checks are paused' },
  { key: 'vendors', name: 'Vendors', icon: 'i-lucide-puzzle', description: 'Dependencies outside our control' }
]

interface DemoMonitor {
  name: string
  /** Key of the owning group in DEMO_GROUPS. */
  group: string
  type: 'http' | 'ping'
  url?: string
  hostname?: string
  description: string
  intervalSeconds: number
  /** Probability that a generated heartbeat starts an outage. */
  failureRate: number
  baseLatency: number
  active?: boolean
  /** Days until the fake TLS certificate expires, for the certificate card. */
  certificateDays?: number
  /** Ends the generated history in an outage, so the demo shows an incident. */
  endsDown?: boolean
}

/**
 * Every entry but the last points at a real, public endpoint, so enabling the
 * demo seed makes the scheduler send actual requests to those hosts. The
 * intervals are deliberately generous for that reason.
 */
const DEMO_MONITORS: DemoMonitor[] = [
  { name: 'Nuxt', group: 'production/web', type: 'http', url: 'https://nuxt.com', description: 'Marketing site', intervalSeconds: 120, failureRate: 0.003, baseLatency: 120, certificateDays: 63 },
  { name: 'Vue', group: 'production/web', type: 'http', url: 'https://vuejs.org', description: 'Framework site', intervalSeconds: 300, failureRate: 0.004, baseLatency: 145, certificateDays: 41 },
  { name: 'Vite', group: 'production/web', type: 'http', url: 'https://vite.dev', description: 'Build tool site', intervalSeconds: 300, failureRate: 0.004, baseLatency: 160, certificateDays: 9 },

  { name: 'GitHub API', group: 'production/api', type: 'http', url: 'https://api.github.com', description: 'REST API endpoint', intervalSeconds: 120, failureRate: 0.006, baseLatency: 210, certificateDays: 78 },
  { name: 'npm Registry', group: 'production/api', type: 'http', url: 'https://registry.npmjs.org', description: 'Package metadata', intervalSeconds: 300, failureRate: 0.008, baseLatency: 260, certificateDays: 52 },

  { name: 'Nuxt UI', group: 'production/docs', type: 'http', url: 'https://ui.nuxt.com', description: 'Component documentation', intervalSeconds: 300, failureRate: 0.003, baseLatency: 135, certificateDays: 63 },
  { name: 'MDN Web Docs', group: 'production/docs', type: 'http', url: 'https://developer.mozilla.org', description: 'Reference documentation', intervalSeconds: 300, failureRate: 0.005, baseLatency: 190, certificateDays: 88 },

  { name: 'Cloudflare DNS', group: 'infrastructure/dns', type: 'ping', hostname: '1.1.1.1', description: 'ICMP reachability', intervalSeconds: 60, failureRate: 0.001, baseLatency: 14 },
  { name: 'Google DNS', group: 'infrastructure/dns', type: 'ping', hostname: '8.8.8.8', description: 'ICMP reachability', intervalSeconds: 120, failureRate: 0.002, baseLatency: 21 },
  { name: 'Quad9 DNS', group: 'infrastructure/dns', type: 'ping', hostname: '9.9.9.9', description: 'ICMP reachability', intervalSeconds: 300, failureRate: 0.004, baseLatency: 33 },

  { name: 'Cloudflare Edge', group: 'infrastructure/edge', type: 'http', url: 'https://www.cloudflare.com', description: 'Edge network entry point', intervalSeconds: 300, failureRate: 0.002, baseLatency: 95, certificateDays: 120 },

  { name: 'Preview Deploy', group: 'staging', type: 'http', url: 'https://example.com', description: 'Paused until the next release', intervalSeconds: 300, failureRate: 0.05, baseLatency: 320, active: false, certificateDays: 27 },

  { name: 'Example Service', group: 'vendors', type: 'http', url: 'https://example.com', description: 'Flaky third party', intervalSeconds: 300, failureRate: 0.05, baseLatency: 340, certificateDays: 34 },
  // Points at a closed local port on purpose: without one failing monitor the
  // demo never shows what an incident looks like.
  { name: 'Billing (legacy)', group: 'vendors', type: 'http', url: 'http://127.0.0.1:9/', description: 'Unreachable on purpose, so the demo has an incident to show', intervalSeconds: 60, failureRate: 0.02, baseLatency: 480, endsDown: true }
]

interface CreatedMonitor {
  id: number
  demo: DemoMonitor
}

/** What a demo seed produced, so the admin UI can report it back. */
export interface DemoDataSummary {
  dashboards: number
  groups: number
  monitors: number
  historyDays: number
}

/**
 * Populates an empty database with demo data on boot. Controlled by
 * NUXT_SEED_DEMO_DATA and only ever runs once; the admin can ask for a fresh
 * set at any time through reseedDemoData.
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

  createDemoData()
}

/**
 * Throws the current contents away and writes a fresh set of demo data. Unlike
 * seedDemoData this ignores both guards: an admin asking for demo data in the
 * UI knows the database is not empty.
 */
export function reseedDemoData(): DemoDataSummary {
  clearAllData()

  return createDemoData()
}

/**
 * Writes demo groups, monitors, synthetic history and showcase dashboards.
 * Expects an empty database, both callers make sure of that.
 */
function createDemoData(): DemoDataSummary {
  const database = useDatabase()
  const { seed } = useRuntimeConfig()
  const now = nowInSeconds()
  const groupIds = createDemoGroups(now)
  const created: CreatedMonitor[] = []

  for (const demo of DEMO_MONITORS) {
    const row = database.insert(monitors).values({
      name: demo.name,
      type: demo.type,
      description: demo.description,
      groupId: groupIds.get(demo.group) ?? null,
      url: demo.url ?? '',
      hostname: demo.hostname ?? '',
      intervalSeconds: demo.intervalSeconds,
      timeoutSeconds: 10,
      retries: 1,
      active: demo.active ?? true,
      createdAt: now,
      updatedAt: now
    }).returning({ id: monitors.id }).get()

    created.push({ id: row.id, demo })
  }

  generateDemoHistory(created, seed.demoHistoryDays)
  const dashboardCount = buildDemoDashboards(created, now)

  aggregateHourlyStats()
  setSetting(SETTING_KEYS.demoSeeded, true)

  console.info(
    `[seed] Created ${groupIds.size} demo groups, ${created.length} demo monitors and `
    + `${dashboardCount} demo dashboards with ${seed.demoHistoryDays} days of generated history.`
  )

  return {
    dashboards: dashboardCount,
    groups: groupIds.size,
    monitors: created.length,
    historyDays: seed.demoHistoryDays
  }
}

/** Inserts the group tree parents first, so every parent id is known. */
function createDemoGroups(now: number): Map<string, number> {
  const database = useDatabase()
  const ids = new Map<string, number>()

  // DEMO_GROUPS lists parents before their children, which is all the ordering
  // this needs.
  DEMO_GROUPS.forEach((group, position) => {
    const row = database.insert(monitorGroups).values({
      name: group.name,
      description: group.description ?? null,
      icon: group.icon,
      parentId: group.parent ? ids.get(group.parent) ?? null : null,
      position,
      createdAt: now,
      updatedAt: now
    }).returning({ id: monitorGroups.id }).get()

    ids.set(group.key, row.id)
  })

  return ids
}

/**
 * Writes synthetic heartbeats so charts have something to show immediately.
 *
 * The last hour is sampled once a minute and everything older every five
 * minutes: the one hour chart buckets per minute, so a uniformly coarse history
 * would leave it almost empty.
 */
function generateDemoHistory(created: CreatedMonitor[], days: number): void {
  const database = useDatabase()
  const now = nowInSeconds()
  const fineWindow = 3600
  const coarseStep = 300
  const fineStep = 60

  const timestamps: number[] = []

  for (let at = now - Math.max(0, Math.round(days * 86_400)); at < now - fineWindow; at += coarseStep) {
    timestamps.push(at)
  }

  for (let at = now - fineWindow; at <= now; at += fineStep) {
    timestamps.push(at)
  }

  database.transaction((transaction) => {
    for (const { id, demo } of created) {
      // The closing outage is measured in samples, which are one minute apart
      // inside the fine window.
      const endsDownFrom = demo.endsDown ? timestamps.length - 34 : Number.POSITIVE_INFINITY
      let outageRemaining = 0
      let lastStatus: 'up' | 'down' = 'up'
      let lastLatency: number | null = demo.baseLatency

      for (const [index, checkedAt] of timestamps.entries()) {
        if (index >= endsDownFrom) {
          outageRemaining = 1
        } else if (outageRemaining > 0) {
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
        message: lastStatus === 'up' ? 'HTTP 200' : 'Connection refused',
        consecutiveFailures: lastStatus === 'down' ? 3 : 0,
        consecutiveSuccesses: lastStatus === 'up' ? 1 : 0,
        certificateExpiresAt: demo.certificateDays ? now + demo.certificateDays * 86_400 : null,
        certificateCheckedAt: demo.certificateDays ? now : null,
        statusChangedAt: now,
        updatedAt: now
      }).onConflictDoNothing().run()
    }
  })
}

/** Builds three dashboard compositions that demonstrate different grid layouts. */
function buildDemoDashboards(created: CreatedMonitor[], now: number): number {
  const database = useDatabase()
  const overview = database.select().from(dashboards).where(eq(dashboards.slug, OVERVIEW_SLUG)).get()

  if (!overview) {
    return 0
  }

  const production = database.insert(dashboards).values({
    slug: 'production',
    name: 'Production',
    description: 'Customer-facing services and response times.',
    isDefault: false,
    position: 1,
    createdAt: now,
    updatedAt: now
  }).returning().get()
  const infrastructure = database.insert(dashboards).values({
    slug: 'infrastructure',
    name: 'Infrastructure',
    description: 'DNS and edge services at a glance.',
    isDefault: false,
    position: 2,
    createdAt: now,
    updatedAt: now
  }).returning().get()
  const nextPositions = new Map<number, number>()

  const monitorId = (name: string): number => {
    const monitor = created.find(entry => entry.demo.name === name)

    if (!monitor) {
      throw new Error(`Demo monitor "${name}" was not created`)
    }

    return monitor.id
  }

  const place = (
    dashboardId: number,
    type: WidgetType,
    width: WidgetWidth,
    height: WidgetHeight,
    linkedMonitorId: number | null,
    config: WidgetConfig
  ) => {
    const position = nextPositions.get(dashboardId) ?? 0

    database.insert(dashboardWidgets).values({
      dashboardId,
      type,
      monitorId: linkedMonitorId,
      config,
      position,
      width,
      height,
      createdAt: now,
      updatedAt: now
    }).run()

    nextPositions.set(dashboardId, position + 1)
  }

  const mainSite = monitorId('Nuxt')
  const infrastructureMonitorNames = ['Cloudflare DNS', 'Google DNS', 'Quad9 DNS', 'Cloudflare Edge']
  const productionMonitorNames = [
    'Nuxt',
    'Vue',
    'Vite',
    'GitHub API',
    'npm Registry',
    'Nuxt UI',
    'MDN Web Docs'
  ]

  place(overview.id, 'status-overview', 'full', 'compact', null, {})
  place(overview.id, 'heading', 'full', 'slim', null, { title: 'Production', level: 2 })
  place(overview.id, 'latency-chart', 'twoThirds', 'tall', mainSite, { range: '24h' })
  place(overview.id, 'monitor', 'third', 'standard', mainSite, { heartbeatCount: 40 })
  place(overview.id, 'uptime-summary', 'third', 'compact', mainSite, { range: '7d' })
  place(overview.id, 'heading', 'full', 'slim', null, { title: 'Infrastructure', level: 2 })

  for (const name of infrastructureMonitorNames) {
    place(overview.id, 'monitor', 'quarter', 'compact', monitorId(name), { heartbeatCount: 40 })
  }

  place(overview.id, 'heading', 'full', 'slim', null, { title: 'Vendors', level: 2 })
  place(overview.id, 'monitor', 'half', 'standard', monitorId('Example Service'), { heartbeatCount: 40 })
  place(overview.id, 'monitor', 'half', 'standard', monitorId('Billing (legacy)'), { heartbeatCount: 40 })

  place(production.id, 'status-overview', 'full', 'compact', null, {
    monitorIds: productionMonitorNames.map(monitorId)
  })
  place(production.id, 'heading', 'full', 'slim', null, { title: 'Web', level: 2 })
  place(production.id, 'latency-chart', 'twoThirds', 'tall', mainSite, { range: '24h' })
  place(production.id, 'monitor', 'third', 'standard', mainSite, { heartbeatCount: 40 })
  place(production.id, 'uptime-summary', 'third', 'compact', mainSite, { range: '30d' })
  place(production.id, 'monitor', 'half', 'standard', monitorId('Vue'), { heartbeatCount: 40 })
  place(production.id, 'monitor', 'half', 'standard', monitorId('Vite'), { heartbeatCount: 40 })
  place(production.id, 'heading', 'full', 'slim', null, { title: 'APIs & Documentation', level: 2 })

  for (const name of ['GitHub API', 'npm Registry', 'Nuxt UI', 'MDN Web Docs']) {
    place(production.id, 'monitor', 'quarter', 'compact', monitorId(name), { heartbeatCount: 40 })
  }

  place(infrastructure.id, 'status-overview', 'full', 'compact', null, {
    monitorIds: infrastructureMonitorNames.map(monitorId)
  })
  place(infrastructure.id, 'heading', 'full', 'slim', null, { title: 'Network', level: 2 })
  place(infrastructure.id, 'latency-chart', 'half', 'standard', monitorId('Cloudflare DNS'), { range: '24h' })
  place(infrastructure.id, 'latency-chart', 'half', 'standard', monitorId('Cloudflare Edge'), { range: '24h' })

  for (const name of infrastructureMonitorNames) {
    place(infrastructure.id, 'monitor', 'quarter', 'compact', monitorId(name), { heartbeatCount: 40 })
  }

  return 3
}

/**
 * Empties the instance: monitors with their whole history, the group tree,
 * every dashboard and every notification channel. The admin account survives,
 * and the empty overview dashboard is put back, so what is left is exactly what
 * a fresh install starts with.
 */
export function clearAllData(): void {
  const database = useDatabase()

  database.transaction((transaction) => {
    // Heartbeats, hourly stats, monitor state and the widgets pointing at a
    // monitor go with the monitors; the widgets of a dashboard go with it.
    transaction.delete(monitors).run()
    transaction.delete(monitorGroups).run()
    transaction.delete(dashboards).run()
    transaction.delete(notificationChannels).run()

    // Both markers describe data that no longer exists. Removing the rows keeps
    // the table in the state a fresh install has it in.
    transaction
      .delete(settings)
      .where(inArray(settings.key, [SETTING_KEYS.demoSeeded, SETTING_KEYS.aggregatedThrough]))
      .run()
  })

  seedDefaultDashboard()
}
