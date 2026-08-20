import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readGroupId(event)
  const existing = getMonitorGroupRow(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  // Subgroups and monitors are lifted to the parent, never deleted.
  deleteMonitorGroup(existing, nowInSeconds())

  return { ok: true }
})
