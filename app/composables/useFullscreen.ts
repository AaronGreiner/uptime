import type { LocationQueryValue } from 'vue-router'

/**
 * Fullscreen drops everything around a dashboard — the sidebar, the navbar and
 * the toolbar — so nothing but the widgets is left on screen.
 *
 * The mode lives in the URL rather than in a cookie or a ref, because the
 * screen it is meant for has nobody standing in front of it: `?fullscreen=1` is
 * bookmarked, opened by a kiosk browser or pushed to a wall panel, and the
 * server then renders the page without its chrome instead of stripping it after
 * hydration. A bare `?fullscreen` reads the same, so the address stays typeable.
 *
 * The browser's own fullscreen is a separate thing and cannot be the same flag:
 * requesting it needs a user gesture, which an opened URL does not have. It is
 * driven alongside the mode wherever a click is available, and `useFullscreenSync`
 * keeps the two in step from there.
 */
const FULLSCREEN_QUERY_PARAM = 'fullscreen'

/**
 * Only the dashboard page draws a way out of the mode, so only it may enter it:
 * a parameter left on some other route must not take that page's navigation
 * away with no button to bring it back.
 */
const FULLSCREEN_ROUTE_PREFIX = '/d/'

function isEnabled(value: LocationQueryValue | LocationQueryValue[] | undefined): boolean {
  const flag = Array.isArray(value) ? value[0] : value

  // `null` is a parameter without a value — `?fullscreen` — and means on.
  return flag !== undefined && flag !== '0' && flag !== 'false'
}

/**
 * Best effort: the request needs a fresh user gesture and can be refused
 * outright, on iOS Safari or inside an iframe without `allowfullscreen`. The
 * application chrome is gone either way; only the browser's own stays.
 */
async function requestBrowserFullscreen() {
  if (!document.fullscreenEnabled || document.fullscreenElement) {
    return
  }

  try {
    await document.documentElement.requestFullscreen()
  } catch {
    // Refused. Nothing to recover: the mode itself does not depend on it.
  }
}

async function exitBrowserFullscreen() {
  if (!document.fullscreenElement) {
    return
  }

  try {
    await document.exitFullscreen()
  } catch {
    // Already left, or left while the promise was in flight.
  }
}

export function useFullscreen() {
  const route = useRoute()
  const router = useRouter()

  const isFullscreen = computed(() =>
    route.path.startsWith(FULLSCREEN_ROUTE_PREFIX) && isEnabled(route.query[FULLSCREEN_QUERY_PARAM])
  )

  /**
   * `replace` rather than `push`: the mode is a way of looking at the page, not
   * a place, and a history entry per toggle would leave the reader pressing back
   * through the same dashboard twice.
   */
  function set(active: boolean) {
    const { [FULLSCREEN_QUERY_PARAM]: _dropped, ...query } = route.query

    return router.replace({
      path: route.path,
      query: active ? { ...query, [FULLSCREEN_QUERY_PARAM]: '1' } : query,
      hash: route.hash
    })
  }

  /**
   * The browser is asked first, while the click that led here is still the
   * current user activation — a route change would be several ticks of somebody
   * else's promises away from it. The mode does not wait for the answer though:
   * an embedded or kiosk browser can leave that request pending forever, and
   * the chrome-less layout must not hang on a permission it does not need.
   */
  function enter() {
    void requestBrowserFullscreen()

    return set(true)
  }

  /**
   * Leaving the browser's fullscreen is not done here: the mode also ends by
   * navigating away, and `useFullscreenSync` follows the flag itself so all of
   * those exits behave the same.
   */
  function exit() {
    return set(false)
  }

  function toggle() {
    return isFullscreen.value ? exit() : enter()
  }

  return { isFullscreen, enter, exit, toggle }
}

/**
 * Binds the two ways out of the mode that are not a button — Escape, and the
 * browser leaving its own fullscreen through F11 or its own escape hatch — to
 * the URL, and takes the browser back out of fullscreen whenever the flag drops.
 *
 * Both listeners are global, so this is called once, from the dashboard layout.
 */
export function useFullscreenSync() {
  if (import.meta.server) {
    return
  }

  const { isFullscreen, exit } = useFullscreen()

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isFullscreen.value) {
      void exit()
    }
  }

  const onBrowserFullscreenChange = () => {
    if (!document.fullscreenElement && isFullscreen.value) {
      void exit()
    }
  }

  // Covers the exit button, Escape and navigating away alike: whatever ended the
  // mode, the browser must not be left in a fullscreen the page no longer fills.
  watch(isFullscreen, (active) => {
    if (!active) {
      void exitBrowserFullscreen()
    }
  })

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    document.addEventListener('fullscreenchange', onBrowserFullscreenChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener('fullscreenchange', onBrowserFullscreenChange)
  })
}
