/**
 * Public like the rest of the read side, and it has to be: the browser resolves
 * the windows itself against the shared clock, which it cannot do without the
 * zone they are written in. A time zone name is not a secret.
 */
export default defineEventHandler(() => {
  return { timeZone: maintenanceTimeZone() }
})
