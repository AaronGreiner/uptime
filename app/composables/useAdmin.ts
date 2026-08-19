/**
 * Read access is public, so the whole UI only needs to know whether the visitor
 * is the admin. Anything mutating is additionally guarded on the server.
 */
export function useAdmin() {
  const { loggedIn, user, clear, fetch: refreshSession } = useUserSession()

  return {
    isAdmin: loggedIn,
    admin: user,
    clearSession: clear,
    refreshSession
  }
}
