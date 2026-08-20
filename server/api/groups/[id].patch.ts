import { eq } from 'drizzle-orm'
import { monitorGroups } from '../../database/schema'
import { monitorGroupInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = readGroupId(event)
  const existing = getMonitorGroupRow(id)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Group not found' })
  }

  const input = await readValidatedBody(event, monitorGroupInputSchema.parse)

  assertValidParent(id, input.parentId)

  const now = nowInSeconds()
  // Moving to another parent appends the group there, otherwise the order among
  // the new siblings would depend on a position that means nothing to them.
  const position = input.parentId === existing.parentId ? existing.position : nextGroupPosition(input.parentId)

  const updated = useDatabase()
    .update(monitorGroups)
    .set({ ...input, position, updatedAt: now })
    .where(eq(monitorGroups.id, id))
    .returning()
    .get()

  return serializeMonitorGroup(updated)
})
