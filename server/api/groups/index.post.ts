import { monitorGroups } from '../../database/schema'
import { monitorGroupInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, monitorGroupInputSchema.parse)

  assertValidParent(null, input.parentId)

  const now = nowInSeconds()
  const created = useDatabase().insert(monitorGroups).values({
    ...input,
    position: nextGroupPosition(input.parentId),
    createdAt: now,
    updatedAt: now
  }).returning().get()

  setResponseStatus(event, 201)

  return serializeMonitorGroup(created)
})
