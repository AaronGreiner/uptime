import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { WidgetConfig, WidgetLayout, WidgetType } from '../../shared/types/dashboard'
import type { HeartbeatStatus, MonitorStatus, MonitorType } from '../../shared/types/monitor'

/** Unix seconds. SQLite has no native date type and integers sort cheaply. */
const timestamp = (name: string) => integer(name, { mode: 'number' })

/**
 * The application intentionally supports a single account. The table exists so
 * credentials can be rotated from the UI without touching the environment.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

/**
 * Monitors are organised in a tree. `parent_id` is nullable, so a group without
 * a parent is a root; the depth is bounded by MONITOR_GROUP_MAX_DEPTH rather
 * than by the schema. Deleting a group never deletes what it holds: the API
 * lifts subgroups and monitors up to the parent first, and the `set null`
 * fallbacks keep the tree consistent should a row ever be removed directly.
 */
export const monitorGroups = sqliteTable('monitor_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  /** Iconify name rendered in the tree, for example `i-lucide-server`. */
  icon: text('icon'),
  parentId: integer('parent_id').references((): AnySQLiteColumn => monitorGroups.id, { onDelete: 'set null' }),
  /** Manual order among siblings. Ties are broken by name. */
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => [
  index('monitor_groups_parent_idx').on(table.parentId)
])

export const monitors = sqliteTable('monitors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').$type<MonitorType>().notNull(),
  description: text('description'),
  /** Null means the monitor sits at the root of the tree, next to the groups. */
  groupId: integer('group_id').references(() => monitorGroups.id, { onDelete: 'set null' }),

  // Scheduling
  intervalSeconds: integer('interval_seconds').notNull().default(60),
  timeoutSeconds: integer('timeout_seconds').notNull().default(10),
  retries: integer('retries').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),

  // HTTP options
  url: text('url').notNull().default(''),
  method: text('method').notNull().default('GET'),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
  body: text('body'),
  expectedStatusCodes: text('expected_status_codes').notNull().default('200-299'),
  keyword: text('keyword'),
  keywordInverted: integer('keyword_inverted', { mode: 'boolean' }).notNull().default(false),
  followRedirects: integer('follow_redirects', { mode: 'boolean' }).notNull().default(true),
  ignoreTls: integer('ignore_tls', { mode: 'boolean' }).notNull().default(false),
  checkCertificateExpiry: integer('check_certificate_expiry', { mode: 'boolean' }).notNull().default(true),
  certificateExpiryWarningDays: integer('certificate_expiry_warning_days').notNull().default(14),

  // Ping options
  hostname: text('hostname').notNull().default(''),
  packetCount: integer('packet_count').notNull().default(3),

  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => [
  index('monitors_active_idx').on(table.active),
  index('monitors_group_idx').on(table.groupId)
])

/**
 * Volatile runtime state, kept apart from the configuration so a check does not
 * touch the row the admin is editing.
 */
export const monitorState = sqliteTable('monitor_state', {
  monitorId: integer('monitor_id').primaryKey().references(() => monitors.id, { onDelete: 'cascade' }),
  status: text('status').$type<MonitorStatus>().notNull().default('pending'),
  lastCheckedAt: timestamp('last_checked_at'),
  nextCheckAt: timestamp('next_check_at'),
  latencyMs: integer('latency_ms'),
  message: text('message'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
  certificateExpiresAt: timestamp('certificate_expires_at'),
  certificateCheckedAt: timestamp('certificate_checked_at'),
  statusChangedAt: timestamp('status_changed_at'),
  updatedAt: timestamp('updated_at').notNull()
}, table => [
  index('monitor_state_next_check_idx').on(table.nextCheckAt)
])

/** One row per executed check. Pruned by the retention job. */
export const heartbeats = sqliteTable('heartbeats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  checkedAt: timestamp('checked_at').notNull(),
  status: text('status').$type<HeartbeatStatus>().notNull(),
  latencyMs: integer('latency_ms'),
  statusCode: integer('status_code'),
  message: text('message')
}, table => [
  index('heartbeats_monitor_checked_idx').on(table.monitorId, table.checkedAt)
])

/** Hour aligned rollups that survive far longer than the raw heartbeats. */
export const monitorStatsHourly = sqliteTable('monitor_stats_hourly', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  bucketStart: timestamp('bucket_start').notNull(),
  upCount: integer('up_count').notNull().default(0),
  downCount: integer('down_count').notNull().default(0),
  avgLatencyMs: integer('avg_latency_ms'),
  minLatencyMs: integer('min_latency_ms'),
  maxLatencyMs: integer('max_latency_ms')
}, table => [
  unique('monitor_stats_hourly_bucket_unq').on(table.monitorId, table.bucketStart),
  index('monitor_stats_hourly_bucket_idx').on(table.bucketStart)
])

export const dashboards = sqliteTable('dashboards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const dashboardWidgets = sqliteTable('dashboard_widgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dashboardId: integer('dashboard_id').notNull().references(() => dashboards.id, { onDelete: 'cascade' }),
  type: text('type').$type<WidgetType>().notNull(),
  monitorId: integer('monitor_id').references(() => monitors.id, { onDelete: 'cascade' }),
  config: text('config', { mode: 'json' }).$type<WidgetConfig>().notNull().default({}),
  layout: text('layout', { mode: 'json' }).$type<WidgetLayout>().notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => [
  index('dashboard_widgets_dashboard_idx').on(table.dashboardId)
])

/**
 * Notification wiring. No provider implementation ships yet; the tables exist so
 * one can be added without a migration. See server/services/notifications.
 */
export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export const monitorNotificationChannels = sqliteTable('monitor_notification_channels', {
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' })
}, table => [
  primaryKey({ columns: [table.monitorId, table.channelId] })
])

/** Free form key/value store for global, admin editable settings. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

export type MonitorGroupRow = typeof monitorGroups.$inferSelect
export type MonitorRow = typeof monitors.$inferSelect
export type MonitorStateRow = typeof monitorState.$inferSelect
export type HeartbeatRow = typeof heartbeats.$inferSelect
export type DashboardRow = typeof dashboards.$inferSelect
export type DashboardWidgetRow = typeof dashboardWidgets.$inferSelect
export type UserRow = typeof users.$inferSelect
