import { maintenanceWindows } from '../../../database/schema'
import { maintenanceWindowInputSchema } from '../../../../shared/utils/validation'
import { nowInSeconds } from '../../../services/scheduler'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const input = await readValidatedBody(event, maintenanceWindowInputSchema.parse)

  assertMaintenanceTargetExists(input)

  const now = nowInSeconds()
  const created = useDatabase()
    .insert(maintenanceWindows)
    .values({ ...input, createdAt: now, updatedAt: now })
    .returning()
    .get()

  setResponseStatus(event, 201)

  return serializeMaintenanceWindow(created)
})
