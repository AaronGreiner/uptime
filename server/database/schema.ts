import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { WidgetConfig, WidgetHeight, WidgetType, WidgetWidth } from '../../shared/types/dashboard'
import type { HeartbeatStatus, MonitorStatus, MonitorType } from '../../shared/types/monitor'
import type {
  NotificationDeliveryStatus,
  NotificationEvent,
  NotificationEventType,
  NotificationLocale,
  NotificationMode
} from '../../shared/types/notification'

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
  /** Where the monitors below this node take their notification groups from. */
  notificationMode: text('notification_mode').$type<NotificationMode>().notNull().default('inherit'),
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

  /** `inherit` looks at the group tree, `custom` at the monitor's own rows. */
  notificationMode: text('notification_mode').$type<NotificationMode>().notNull().default('inherit'),

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
  position: integer('position').notNull().default(0),
  width: text('width').$type<WidgetWidth>().notNull().default('half'),
  height: text('height').$type<WidgetHeight>().notNull().default('standard'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => [
  index('dashboard_widgets_dashboard_idx').on(table.dashboardId)
])

/**
 * One transport with its credentials. `config` is provider specific and is only
 * ever read back through a serialiser that masks the secrets in it.
 *
 * The error columns exist because a self-hosted instance has nobody watching
 * stderr: a channel that stopped delivering has to be able to say so in the UI.
 */
export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  /** Messages are rendered on the server, where no browser locale exists. */
  language: text('language').$type<NotificationLocale>().notNull().default('en'),
  position: integer('position').notNull().default(0),
  lastSuccessAt: timestamp('last_success_at'),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
})

/**
 * A named bundle of channels plus the events it reacts to. Monitors point at
 * groups rather than at channels, so one channel can stay quiet in one group
 * and loud in another without being configured twice.
 */
export const notificationGroups = sqliteTable('notification_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  notifyDown: integer('notify_down', { mode: 'boolean' }).notNull().default(true),
  notifyUp: integer('notify_up', { mode: 'boolean' }).notNull().default(true),
  notifyCertificateExpiring: integer('notify_certificate_expiring', { mode: 'boolean' }).notNull().default(true),
  /** Catches monitors whose inheritance walk reaches the root undecided. */
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
}, table => [
  index('notification_groups_default_idx').on(table.isDefault)
])

export const notificationGroupChannels = sqliteTable('notification_group_channels', {
  groupId: integer('group_id').notNull().references(() => notificationGroups.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' })
}, table => [
  primaryKey({ columns: [table.groupId, table.channelId] })
])

/** Assignment to a single monitor, used when its mode is `custom`. */
export const monitorNotificationGroups = sqliteTable('monitor_notification_groups', {
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => notificationGroups.id, { onDelete: 'cascade' })
}, table => [
  primaryKey({ columns: [table.monitorId, table.groupId] })
])

/** Assignment to a node of the monitor tree, which everything below inherits. */
export const monitorGroupNotificationGroups = sqliteTable('monitor_group_notification_groups', {
  monitorGroupId: integer('monitor_group_id').notNull().references(() => monitorGroups.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => notificationGroups.id, { onDelete: 'cascade' })
}, table => [
  primaryKey({ columns: [table.monitorGroupId, table.groupId] })
])

/**
 * One attempt to hand one event to one channel, and at the same time the queue
 * the worker reads. Writing the row is the only notification work that happens
 * while a check runs; everything that touches the network happens afterwards.
 *
 * A restart therefore loses nothing, and the same rows are what the delivery log
 * in the UI reads.
 */
export const notificationDeliveries = sqliteTable('notification_deliveries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' }),
  /** Cleared rather than cascaded: the history outlives the group that caused it. */
  groupId: integer('group_id').references(() => notificationGroups.id, { onDelete: 'set null' }),
  monitorId: integer('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  eventType: text('event_type').$type<NotificationEventType>().notNull(),
  /** The event as it was at enqueue time, so a retry reports the original facts. */
  payload: text('payload', { mode: 'json' }).$type<NotificationEvent>().notNull(),
  status: text('status').$type<NotificationDeliveryStatus>().notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at').notNull(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull(),
  deliveredAt: timestamp('delivered_at')
}, table => [
  index('notification_deliveries_due_idx').on(table.status, table.nextAttemptAt),
  index('notification_deliveries_monitor_idx').on(table.monitorId, table.channelId, table.createdAt)
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
export type NotificationChannelRow = typeof notificationChannels.$inferSelect
export type NotificationGroupRow = typeof notificationGroups.$inferSelect
export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect
