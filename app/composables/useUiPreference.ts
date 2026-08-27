/**
 * A piece of interface state that survives a reload, stored in a cookie rather
 * than in `localStorage`: the sidebar and the navigation tree are rendered on
 * the server, and a value that only arrives after hydration makes the layout
 * jump. `UDashboardGroup` stores the sidebar width the same way.
 *
 * `isValid` guards against a stale or hand edited cookie: a value the current
 * version no longer understands falls back instead of reaching a component.
 */
export function useUiPreference<T>(
  key: string,
  fallback: () => T,
  isValid?: (value: unknown) => boolean
) {
  const cookie = useCookie<T>(`uptime-${key}`, {
    default: fallback,
    maxAge: UI_PREFERENCE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    path: '/'
  })

  return computed<T>({
    get: () => !isValid || isValid(cookie.value) ? cookie.value : fallback(),
    set: (value) => {
      cookie.value = value
    }
  })
}
