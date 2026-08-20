import { z } from 'zod'
import { GRID_BREAKPOINTS } from './grid'
import { MONITOR_INTERVAL_BOUNDS, MONITOR_PACKET_BOUNDS, MONITOR_RETRY_BOUNDS, MONITOR_TIMEOUT_BOUNDS } from './monitor'

export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

/** Hostnames, IPv4 literals and bare IPv6 literals. */
const HOSTNAME_PATTERN = /^(?:[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?|[0-9a-fA-F:]+)$/

/** Accepts `200`, `200-299` and comma separated combinations of both. */
const STATUS_CODE_PATTERN = /^\s*\d{3}(\s*-\s*\d{3})?(\s*,\s*\d{3}(\s*-\s*\d{3})?)*\s*$/

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Fallback wording used on the server and before the client plugin installs the
 * i18n translator. Keys match the `validation` section of the locale files.
 */
const FALLBACK_MESSAGES: Record<string, string> = {
  'validation.required': 'This field is required',
  'validation.tooLong': 'Use at most {max} characters',
  'validation.url': 'Enter a valid http:// or https:// URL',
  'validation.hostname': 'Enter a valid hostname or IP address',
  'validation.slug': 'Use lowercase letters, digits and dashes only',
  'validation.statusCodes': 'Use single codes or ranges, for example 200-299,301',
  'validation.timeoutTooLong': 'The timeout must not exceed the check interval',
  'validation.monitorRequired': 'Select a monitor for this widget',
  'validation.outOfRange': 'Enter a value between {min} and {max}',
  'validation.tooShort': 'Use at least {min} characters'
}

type MessageParams = Record<string, string | number>

let translate = (key: string, params?: MessageParams) => interpolate(FALLBACK_MESSAGES[key] ?? key, params)

/** Installed by the client plugin so validation errors follow the UI language. */
export function setValidationTranslator(fn: (key: string, params?: MessageParams) => string): void {
  translate = fn
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template
  }

  return Object.entries(params).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, String(value)),
    template
  )
}

/**
 * Zod evaluates message factories at validation time, which is what makes a
 * language switch apply to errors that are already on screen.
 */
function message(key: string, params?: MessageParams) {
  return () => translate(key, params)
}

const requiredText = (max: number) => z
  .string({ error: message('validation.required') })
  .trim()
  .min(1, { error: message('validation.required') })
  .max(max, { error: message('validation.tooLong', { max }) })

const optionalText = (max: number) => z
  .string()
  .trim()
  .max(max, { error: message('validation.tooLong', { max }) })
  .nullish()
  .transform(value => value || null)

const boundedNumber = (min: number, max: number) => z
  .number({ error: message('validation.outOfRange', { min, max }) })
  .int({ error: message('validation.outOfRange', { min, max }) })
  .min(min, { error: message('validation.outOfRange', { min, max }) })
  .max(max, { error: message('validation.outOfRange', { min, max }) })

const optionalId = () => z
  .number()
  .int()
  .positive()
  .nullish()
  .transform(value => value ?? null)

export const monitorInputSchema = z.object({
  name: requiredText(120),
  type: z.enum(['http', 'ping'], { error: message('validation.required') }),
  description: optionalText(500),
  groupId: optionalId(),

  intervalSeconds: boundedNumber(MONITOR_INTERVAL_BOUNDS.min, MONITOR_INTERVAL_BOUNDS.max),
  timeoutSeconds: boundedNumber(MONITOR_TIMEOUT_BOUNDS.min, MONITOR_TIMEOUT_BOUNDS.max),
  retries: boundedNumber(MONITOR_RETRY_BOUNDS.min, MONITOR_RETRY_BOUNDS.max),
  active: z.boolean(),

  url: z.string().trim().max(2000, { error: message('validation.tooLong', { max: 2000 }) }).default(''),
  method: z.enum(HTTP_METHODS).default('GET'),
  headers: z.record(z.string().trim().min(1), z.string()).default({}),
  body: optionalText(100_000),
  expectedStatusCodes: z
    .string()
    .trim()
    .regex(STATUS_CODE_PATTERN, { error: message('validation.statusCodes') })
    .default('200-299'),
  keyword: optionalText(200),
  keywordInverted: z.boolean().default(false),
  followRedirects: z.boolean().default(true),
  ignoreTls: z.boolean().default(false),
  checkCertificateExpiry: z.boolean().default(true),
  certificateExpiryWarningDays: boundedNumber(1, 90).default(14),

  hostname: z.string().trim().max(253, { error: message('validation.tooLong', { max: 253 }) }).default(''),
  packetCount: boundedNumber(MONITOR_PACKET_BOUNDS.min, MONITOR_PACKET_BOUNDS.max).default(3)
}).superRefine((value, context) => {
  if (value.timeoutSeconds > value.intervalSeconds) {
    context.addIssue({
      code: 'custom',
      path: ['timeoutSeconds'],
      message: translate('validation.timeoutTooLong')
    })
  }

  if (value.type === 'http' && !isHttpUrl(value.url)) {
    context.addIssue({ code: 'custom', path: ['url'], message: translate('validation.url') })
  }

  if (value.type === 'ping' && !HOSTNAME_PATTERN.test(value.hostname)) {
    context.addIssue({ code: 'custom', path: ['hostname'], message: translate('validation.hostname') })
  }
})

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)

    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export type MonitorInput = z.output<typeof monitorInputSchema>

export const monitorGroupInputSchema = z.object({
  name: requiredText(120),
  description: optionalText(500),
  /** Free form so a future icon picker is not blocked by an enum here. */
  icon: optionalText(60),
  parentId: optionalId()
})

export type MonitorGroupInput = z.output<typeof monitorGroupInputSchema>

/** Swaps a group with the neighbouring sibling in the given direction. */
export const monitorGroupMoveSchema = z.object({
  direction: z.enum(['up', 'down'])
})

export const dashboardInputSchema = z.object({
  name: requiredText(120),
  slug: requiredText(80).regex(SLUG_PATTERN, { error: message('validation.slug') }),
  description: optionalText(500),
  isDefault: z.boolean().default(false)
})

export type DashboardInput = z.output<typeof dashboardInputSchema>

const widgetPositionSchema = z.object({
  x: z.number().int().min(0).max(48),
  y: z.number().int().min(0).max(1000),
  w: z.number().int().min(1).max(48),
  h: z.number().int().min(1).max(100)
})

export const widgetLayoutSchema = z.object(
  Object.fromEntries(GRID_BREAKPOINTS.map(breakpoint => [breakpoint, widgetPositionSchema]))
) as z.ZodType<Record<(typeof GRID_BREAKPOINTS)[number], z.output<typeof widgetPositionSchema>>>

export const widgetConfigSchema = z.object({
  title: z.string().trim().max(120, { error: message('validation.tooLong', { max: 120 }) }).optional(),
  range: z.enum(['1h', '24h', '7d', '30d', '1y']).optional(),
  heartbeatCount: boundedNumber(10, 100).optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  monitorIds: z.array(z.number().int().positive()).max(100).optional()
})

export const widgetInputSchema = z.object({
  type: z.enum(['monitor', 'uptime-summary', 'latency-chart', 'status-overview', 'heading']),
  monitorId: z.number().int().positive().nullish().transform(value => value ?? null),
  config: widgetConfigSchema.default({}),
  layout: widgetLayoutSchema.optional()
}).superRefine((value, context) => {
  const requiresMonitor = value.type === 'monitor' || value.type === 'latency-chart' || value.type === 'uptime-summary'

  if (requiresMonitor && !value.monitorId) {
    context.addIssue({ code: 'custom', path: ['monitorId'], message: translate('validation.monitorRequired') })
  }
})

export type WidgetInput = z.output<typeof widgetInputSchema>

/** Bulk payload written when the admin stops dragging widgets around. */
export const dashboardLayoutSchema = z.object({
  widgets: z.array(z.object({
    id: z.number().int().positive(),
    layout: widgetLayoutSchema
  })).max(200)
})

export const loginSchema = z.object({
  username: requiredText(60),
  password: z.string().min(1, { error: message('validation.required') })
})

export const accountUpdateSchema = z.object({
  username: requiredText(60).min(3, { error: message('validation.tooShort', { min: 3 }) }),
  currentPassword: z.string().min(1, { error: message('validation.required') }),
  newPassword: z
    .string()
    .min(10, { error: message('validation.tooShort', { min: 10 }) })
    .max(200, { error: message('validation.tooLong', { max: 200 }) })
    .optional()
    .or(z.literal('').transform(() => undefined))
})
