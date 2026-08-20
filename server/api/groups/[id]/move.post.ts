import { monitorGroupMoveSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

/** Reorders a group among its siblings. Moving past an end is a no-op. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readGroupId(event)
  const existing = getMonitorGroupRow(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  const { direction } = await readValidatedBody(event, monitorGroupMoveSchema.parse)

  moveMonitorGroup(existing, direction, nowInSeconds())

  return listMonitorGroups()
})
