/**
 * Runs a callback on an interval while the tab is visible. Fresh data arrives
 * over the event stream (`plugins/live.ts`); this is the slow safety net behind
 * it, reconciling whatever a closed or stalled stream missed.
 *
 * Becoming visible deliberately does not fire the callback: the stream reopens
 * at the same moment and reports the gap through `onResumed`.
 */
export function usePolling(callback: () => unknown, intervalMs = 60_000) {
  if (import.meta.server) {
    return
  }

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

    timer = setInterval(callback, intervalMs)
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      start()
    } else {
      stop()
    }
  }

  onMounted(() => {
    start()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
}
