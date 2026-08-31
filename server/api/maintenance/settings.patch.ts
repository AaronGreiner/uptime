import { maintenanceSettingsSchema } from '../../../shared/utils/validation'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { timeZone } = await readValidatedBody(event, maintenanceSettingsSchema.parse)

  setSetting(SETTING_KEYS.maintenanceTimeZone, timeZone)

  return { timeZone }
})
