/** Resolution of the shared clock. Relative labels are accurate to the second. */
const CLOCK_INTERVAL_MS = 1_000

/**
 * Drives the one clock the application reads through `useNow()`. A single timer
 * covers every relative timestamp on the page, no matter how many cards are on
 * it, and it stops while the tab is hidden where nobody is reading it.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const now = useNow()

  let timer: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const start = () => {
    if (timer) {
      return
    }

    // The hydrated value comes from the server clock, so catch up before ticking.
    now.value = Date.now()

    timer = setInterval(() => {
      now.value = Date.now()
    }, CLOCK_INTERVAL_MS)
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      start()
    } else {
      stop()
    }
  }

  const activate = () => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    start()
  }

  // Mount can happen while an async page suspense is still hydrating. Wait for
  // both boundaries before moving the server-provided clock value.
  nuxtApp.hook('app:mounted', () => {
    if (nuxtApp.isHydrating) {
      nuxtApp.hooks.hookOnce('app:suspense:resolve', activate)
    } else {
      activate()
    }
  })
})
