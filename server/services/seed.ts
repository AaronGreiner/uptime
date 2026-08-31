import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import type { WidgetConfig, WidgetHeight, WidgetType, WidgetWidth } from '../../shared/types/dashboard'
import type { HeartbeatReportedStatus } from '../../shared/types/monitor'
import { dashboards, dashboardWidgets, heartbeats, maintenanceWindows, monitorGroups, monitors, monitorState, monitorStatsHourly, notificationChannels, notificationGroups, settings, users } from '../database/schema'
import { WEEKDAY_MASK_ALL, windowRemainingMinutes, zonedClock } from '../../shared/utils/maintenance'
import { widgetConfigForType } from '../../shared/utils/widget'
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
  /** A recurring window on this node, inherited by everything below it. */
  maintenance?: {
    note: string
    weekdays: number
    startMinute: number
    durationMinutes: number
  }
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
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    icon: 'i-lucide-server',
    description: 'Network and edge',
    // The schedule the whole feature exists for: the boxes below this node are
    // rebooted nightly, and the failing checks that produces are not an outage.
    maintenance: { note: 'Boxes reboot after the backup', weekdays: WEEKDAY_MASK_ALL, startMinute: 3 * 60, durationMinutes: 30 }
  },
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
  const dashboardCount = buildDemoDashboards(created, groupIds, now)

  aggregateHourlyStats()
  // Runs after the aggregation on purpose: it only writes buckets older than the
  // oldest heartbeat, which is exactly where the aggregation stops looking.
  generateDemoRollups(created, seed.demoStatsDays, seed.demoHistoryDays)
  setSetting(SETTING_KEYS.demoSeeded, true)

  console.info(
    `[seed] Created ${groupIds.size} demo groups, ${created.length} demo monitors and `
    + `${dashboardCount} demo dashboards with ${seed.demoHistoryDays} days of generated history `
    + `and ${seed.demoStatsDays} days of hourly aggregates.`
  )

  return {
    dashboards: dashboardCount,
    groups: groupIds.size,
    monitors: created.length,
    historyDays: seed.demoStatsDays
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

    if (group.maintenance) {
      database.insert(maintenanceWindows).values({
        monitorGroupId: row.id,
        note: group.maintenance.note,
        weekdays: group.maintenance.weekdays,
        startMinute: group.maintenance.startMinute,
        durationMinutes: group.maintenance.durationMinutes,
        enabled: true,
        createdAt: now,
        updatedAt: now
      }).run()
    }

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
/**
 * Whether a generated check falls inside a demo window.
 *
 * Resolved with the very function the scheduler uses, so the synthetic history
 * agrees with what a live check would have recorded — the demo is meant to show
 * the feature, not an approximation of it.
 */
function demoMaintenanceMatcher(): (demo: DemoMonitor, at: number) => boolean {
  const timeZone = maintenanceTimeZone()
  const owners = DEMO_GROUPS.filter(group => group.maintenance)

  return (demo, at) => {
    const clock = zonedClock(at, timeZone)

    return owners.some(owner => (demo.group === owner.key || demo.group.startsWith(`${owner.key}/`))
      && windowRemainingMinutes(
        { id: 0, monitorId: null, monitorGroupId: null, enabled: true, ...owner.maintenance! },
        clock
      ) !== null)
  }
}

function generateDemoHistory(created: CreatedMonitor[], days: number): void {
  const database = useDatabase()
  const now = nowInSeconds()
  const fineWindow = 3600
  const coarseStep = 300
  const fineStep = 60
  const underMaintenance = demoMaintenanceMatcher()

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
      let lastReportedStatus: HeartbeatReportedStatus = 'up'
      let lastLatency: number | null = demo.baseLatency
      let consecutiveFailures = 0

      for (const [index, checkedAt] of timestamps.entries()) {
        // A rebooting box does fail its checks; that is the whole reason the
        // window exists. The heartbeat records the failure and marks it as not
        // judged, exactly as `recordCheckResult` would.
        const maintaining = underMaintenance(demo, checkedAt)

        if (index >= endsDownFrom) {
          outageRemaining = 1
        } else if (outageRemaining > 0) {
          outageRemaining--
        } else if (!maintaining && Math.random() < demo.failureRate) {
          outageRemaining = 1 + Math.floor(Math.random() * 4)
        }

        const isDown = maintaining || outageRemaining > 0
        // A daily sine wave plus noise makes the latency chart look plausible.
        const timeOfDay = (checkedAt % 86_400) / 86_400
        const wave = Math.sin(timeOfDay * Math.PI * 2) * demo.baseLatency * 0.2
        const noise = (Math.random() - 0.5) * demo.baseLatency * 0.3
        const latency = Math.max(1, Math.round(demo.baseLatency + wave + noise))

        lastStatus = isDown ? 'down' : 'up'
        // Frozen inside a window, like the state machine itself.
        consecutiveFailures = maintaining ? consecutiveFailures : isDown ? consecutiveFailures + 1 : 0
        lastReportedStatus = maintaining
          ? 'maintenance'
          : isDown
            ? consecutiveFailures > 1 ? 'down' : 'pending'
            : 'up'
        lastLatency = isDown ? null : latency

        transaction.insert(heartbeats).values({
          monitorId: id,
          checkedAt,
          status: lastStatus,
          reportedStatus: lastReportedStatus,
          latencyMs: lastLatency,
          statusCode: demo.type === 'http' ? (isDown ? 503 : 200) : null,
          message: isDown
            ? (demo.type === 'http' ? 'HTTP 503, expected 200-299' : '100% packet loss')
            : (demo.type === 'http' ? 'HTTP 200' : '3/3 replies')
        }).run()
      }

      transaction.insert(monitorState).values({
        monitorId: id,
        // `maintenance` is never stored: the state row keeps what the checks
        // last established underneath a window.
        status: lastReportedStatus === 'maintenance' ? 'pending' : lastReportedStatus,
        lastCheckedAt: now,
        nextCheckAt: now + Math.floor(Math.random() * 20),
        latencyMs: lastLatency,
        message: lastStatus === 'up' ? 'HTTP 200' : 'Connection refused',
        consecutiveFailures,
        consecutiveSuccesses: lastStatus === 'up' ? 1 : 0,
        certificateExpiresAt: demo.certificateDays ? now + demo.certificateDays * 86_400 : null,
        certificateCheckedAt: demo.certificateDays ? now : null,
        statusChangedAt: now,
        updatedAt: now
      }).onConflictDoNothing().run()
    }
  })
}

/**
 * Writes hourly aggregates for the span the raw heartbeats do not cover.
 *
 * The calendar, the SLA table and the incident history all reach back further
 * than the heartbeat retention, so a demo database whose history starts a week
 * ago would show them empty — which is the opposite of what a demo is for.
 *
 * Outages are modelled as rare, dated incidents rather than as a coin flip per
 * check: a real service is up all day and then down for half an hour, and that
 * is what makes a calendar of days worth looking at. Rolling the per check
 * failure rate out over months instead would spread the same downtime evenly and
 * turn every square the same shade.
 */
function generateDemoRollups(created: CreatedMonitor[], days: number, skipRecentDays: number): void {
  const database = useDatabase()
  const now = nowInSeconds()
  const currentHour = Math.floor(now / 3600) * 3600
  const until = currentHour - Math.round(skipRecentDays * 24) * 3600
  const from = currentHour - Math.round(days * 24) * 3600

  if (from >= until) {
    return
  }

  const underMaintenance = demoMaintenanceMatcher()

  database.transaction((transaction) => {
    for (const { id, demo } of created) {
      const checksPerHour = Math.max(1, Math.round(3600 / demo.intervalSeconds))
      const downMinutes = plannedOutageMinutes(demo, from, until)

      for (let bucketStart = from; bucketStart < until; bucketStart += 3600) {
        const minutesDown = Math.min(60, downMinutes.get(bucketStart) ?? 0)
        // Sampled at the half hour, which is inside the demo window rather than
        // on either of its edges. A bucket is an hour and the window half of one,
        // so counting the checks that fall in it is a proportion, not a flag.
        const maintenanceCount = underMaintenance(demo, bucketStart + 1800)
          ? Math.round(checksPerHour / 2)
          : 0
        const downCount = Math.round(checksPerHour * (minutesDown / 60))
        const upCount = Math.max(0, checksPerHour - downCount - maintenanceCount)
        // A daily sine wave plus noise, the same shape the raw history uses.
        const timeOfDay = (bucketStart % 86_400) / 86_400
        const wave = Math.sin(timeOfDay * Math.PI * 2) * demo.baseLatency * 0.2
        const average = Math.max(1, Math.round(demo.baseLatency + wave + (Math.random() - 0.5) * demo.baseLatency * 0.2))

        transaction.insert(monitorStatsHourly).values({
          monitorId: id,
          bucketStart,
          upCount,
          downCount,
          maintenanceCount,
          avgLatencyMs: upCount > 0 ? average : null,
          minLatencyMs: upCount > 0 ? Math.round(average * 0.8) : null,
          maxLatencyMs: upCount > 0 ? Math.round(average * 1.6) : null
        }).onConflictDoNothing().run()
      }
    }
  })
}

/**
 * Minutes of downtime per hour bucket, from a handful of incidents scattered
 * over the span. The per check failure rate is read as how troubled the monitor
 * is, not as a probability, because one is per check and the other per day.
 */
function plannedOutageMinutes(demo: DemoMonitor, from: number, until: number): Map<number, number> {
  const minutes = new Map<number, number>()
  const chancePerDay = Math.min(0.5, demo.failureRate * 8)

  for (let dayStart = from; dayStart < until; dayStart += 86_400) {
    if (Math.random() >= chancePerDay) {
      continue
    }

    // Short outages are the common case; the tail is what fills a whole hour.
    const duration = Math.round(8 + Math.random() ** 3 * 160)
    const start = dayStart + Math.floor(Math.random() * 86_400)

    for (let at = start; at < start + duration * 60; at += 60) {
      const bucket = Math.floor(at / 3600) * 3600

      minutes.set(bucket, (minutes.get(bucket) ?? 0) + 1)
    }
  }

  return minutes
}

/** Builds four dashboard compositions that demonstrate the widget catalogue. */
function buildDemoDashboards(created: CreatedMonitor[], groupIds: Map<string, number>, now: number): number {
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
  const reliability = database.insert(dashboards).values({
    slug: 'reliability',
    name: 'Reliability',
    description: 'Outages, uptime targets and the error budget behind them.',
    isDefault: false,
    position: 3,
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
      // Through the registry like every other write, so the seed cannot produce
      // a widget the settings dialog would not.
      config: widgetConfigForType(type, config),
      position,
      width,
      height,
      createdAt: now,
      updatedAt: now
    }).run()

    nextPositions.set(dashboardId, position + 1)
  }

  const mainSite = monitorId('Nuxt')
  const productionGroup = groupIds.get('production') ?? null
  const infrastructureGroup = groupIds.get('infrastructure') ?? null
  const infrastructureMonitorNames = ['Cloudflare DNS', 'Google DNS', 'Quad9 DNS', 'Cloudflare Edge']

  place(overview.id, 'status-overview', 'full', 'compact', null, {})
  place(overview.id, 'incident-feed', 'half', 'standard', null, {})
  place(overview.id, 'certificate-expiry', 'half', 'standard', null, {})
  place(overview.id, 'heading', 'full', 'slim', null, { title: 'Production', level: 2 })
  place(overview.id, 'latency-chart', 'twoThirds', 'tall', mainSite, { range: '24h' })
  place(overview.id, 'monitor', 'third', 'standard', mainSite, {})
  place(overview.id, 'uptime-summary', 'third', 'compact', mainSite, { range: '7d' })
  place(overview.id, 'heading', 'full', 'slim', null, { title: 'Infrastructure', level: 2 })
  place(overview.id, 'monitor-list', 'half', 'standard', null, {
    groupId: infrastructureGroup,
    sort: 'status'
  })
  place(overview.id, 'uptime-calendar', 'half', 'standard', monitorId('Cloudflare DNS'), {})
  place(overview.id, 'heading', 'full', 'slim', null, { title: 'Vendors', level: 2 })
  place(overview.id, 'monitor', 'half', 'standard', monitorId('Example Service'), {})
  place(overview.id, 'monitor', 'half', 'standard', monitorId('Billing (legacy)'), {})

  place(production.id, 'status-overview', 'full', 'compact', null, { groupId: productionGroup })
  place(production.id, 'sla-table', 'full', 'standard', null, {
    groupId: productionGroup,
    range: '30d',
    target: 0.999
  })
  place(production.id, 'heading', 'full', 'slim', null, { title: 'Web', level: 2 })
  place(production.id, 'latency-chart', 'twoThirds', 'tall', mainSite, { range: '24h' })
  place(production.id, 'monitor', 'third', 'standard', mainSite, {})
  place(production.id, 'uptime-summary', 'third', 'compact', mainSite, { range: '30d' })
  place(production.id, 'uptime-calendar', 'half', 'standard', mainSite, {})
  place(production.id, 'monitor-list', 'half', 'standard', null, {
    groupId: productionGroup,
    sort: 'latency'
  })
  place(production.id, 'heading', 'full', 'slim', null, { title: 'APIs & Documentation', level: 2 })

  for (const name of ['GitHub API', 'npm Registry', 'Nuxt UI', 'MDN Web Docs']) {
    place(production.id, 'monitor', 'quarter', 'compact', monitorId(name), {})
  }

  place(infrastructure.id, 'status-overview', 'full', 'compact', null, { groupId: infrastructureGroup })
  place(infrastructure.id, 'heading', 'full', 'slim', null, { title: 'Network', level: 2 })
  place(infrastructure.id, 'latency-chart', 'half', 'standard', monitorId('Cloudflare DNS'), { range: '24h' })
  place(infrastructure.id, 'latency-chart', 'half', 'standard', monitorId('Cloudflare Edge'), { range: '24h' })
  place(infrastructure.id, 'monitor-list', 'half', 'standard', null, {
    groupId: infrastructureGroup,
    sort: 'name'
  })
  place(infrastructure.id, 'certificate-expiry', 'half', 'standard', null, {
    groupId: infrastructureGroup
  })
  place(infrastructure.id, 'maintenance-schedule', 'half', 'standard', null, {
    groupId: infrastructureGroup
  })

  for (const name of infrastructureMonitorNames) {
    place(infrastructure.id, 'monitor', 'quarter', 'compact', monitorId(name), {})
  }

  place(reliability.id, 'reliability-kpis', 'full', 'compact', null, { range: '30d' })
  place(reliability.id, 'heading', 'full', 'slim', null, { title: 'Incidents', level: 2 })
  place(reliability.id, 'incident-history', 'twoThirds', 'tall', null, { range: '30d' })
  place(reliability.id, 'incident-feed', 'third', 'tall', null, {})
  place(reliability.id, 'heading', 'full', 'slim', null, { title: 'Uptime targets', level: 2 })
  place(reliability.id, 'sla-table', 'full', 'tall', null, { range: '30d', target: 0.999 })
  place(reliability.id, 'heading', 'full', 'slim', null, { title: 'The two that keep failing', level: 2 })
  place(reliability.id, 'uptime-calendar', 'half', 'standard', monitorId('Example Service'), {})
  place(reliability.id, 'uptime-calendar', 'half', 'standard', monitorId('Billing (legacy)'), {})

  return 4
}

/**
 * Empties the instance: monitors with their whole history, the group tree, every
 * dashboard, and the notification channels and groups with their delivery log.
 * The admin account survives, and the empty overview dashboard is put back, so
 * what is left is exactly what a fresh install starts with.
 */
export function clearAllData(): void {
  const database = useDatabase()

  database.transaction((transaction) => {
    // Heartbeats, hourly stats, monitor state, the maintenance windows and the
    // widgets pointing at a monitor go with the monitors; the widgets of a
    // dashboard go with it.
    transaction.delete(monitors).run()
    transaction.delete(monitorGroups).run()
    transaction.delete(dashboards).run()

    // Both sides of the notification wiring, or the groups would survive as
    // empty shells pointing at channels that are gone.
    transaction.delete(notificationChannels).run()
    transaction.delete(notificationGroups).run()

    // Both markers describe data that no longer exists. Removing the rows keeps
    // the table in the state a fresh install has it in.
    transaction
      .delete(settings)
      .where(inArray(settings.key, [SETTING_KEYS.demoSeeded, SETTING_KEYS.aggregatedThrough]))
      .run()
  })

  seedDefaultDashboard()
}
