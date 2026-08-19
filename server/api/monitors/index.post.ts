import { monitors, monitorState } from '../../database/schema'
import { monitorInputSchema } from '../../../shared/utils/validation'
import { nowInSeconds } from '../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, monitorInputSchema.parse)
  const database = useDatabase()
  const now = nowInSeconds()

  const created = database.insert(monitors).values({
    ...input,
    createdAt: now,
    updatedAt: now
  }).returning().get()

  // Schedule the first check right away so the card is not empty for a minute.
  database.insert(monitorState).values({
    monitorId: created.id,
    status: input.active ? 'pending' : 'paused',
    nextCheckAt: now,
    updatedAt: now
  }).run()

  setResponseStatus(event, 201)

  return getMonitorWithState(created.id)
})
