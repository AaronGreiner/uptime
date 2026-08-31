/**
 * Public like the rest of the read side, and for the same reason the windows
 * already travel inside `/api/monitors`: a schedule is not a secret, and the
 * browser resolves it against the same clock the server does.
 */
export default defineEventHandler(() => {
  return listMaintenanceWindows()
})
