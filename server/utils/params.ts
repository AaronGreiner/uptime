import type { H3Event } from 'h3'

/** Reads and validates the `id` route parameter shared by the monitor routes. */
export function readMonitorId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid monitor id' })
  }

  return id
}

export function readGroupId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid group id' })
  }

  return id
}

export function readDashboardKey(event: H3Event): string {
  const key = getRouterParam(event, 'id')

  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid dashboard identifier' })
  }

  return key
}

export function readWidgetId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'widgetId'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid widget id' })
  }

  return id
}

export function readNotificationChannelId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid channel id' })
  }

  return id
}

export function readMaintenanceWindowId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid maintenance window id' })
  }

  return id
}

export function readNotificationGroupId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notification group id' })
  }

  return id
}

/**
 * Reads a comma separated list of monitor ids from a query string. An empty or
 * missing value means "no restriction", which the callers read as "everything".
 *
 * The cap is generous because a widget scoped to a group sends the whole subtree,
 * and silently dropping its tail would leave rows missing from a table without
 * anything saying so. Callers covering every monitor send no list at all.
 */
export function parseIdList(value: unknown, max = 500): number[] {
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  const ids = value
    .split(',')
    .map(entry => Number(entry.trim()))
    .filter(id => Number.isInteger(id) && id > 0)

  return [...new Set(ids)].slice(0, max)
}
