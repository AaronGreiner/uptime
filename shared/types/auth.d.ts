/**
 * Session payload shape for nuxt-auth-utils. The application knows exactly one
 * account, so the session only carries what the UI needs to render.
 */
declare module '#auth-utils' {
  interface User {
    id: number
    username: string
  }

  interface UserSession {
    loggedInAt: number
  }

  // Nothing needs to stay server-only for a single account.
  interface SecureSessionData { [key: string]: never }
}

export {}
