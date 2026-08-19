import type { H3Event } from 'h3'

/** Reads and validates the `id` route parameter shared by the monitor routes. */
export function readMonitorId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid monitor id' })
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
