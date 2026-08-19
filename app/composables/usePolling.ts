/**
 * Runs a callback on an interval while the tab is visible. Monitoring data is
 * refreshed by polling because a self-hosted single-node app does not warrant a
 * websocket layer.
 */
export function usePolling(callback: () => unknown, intervalMs = 10_000) {
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

    timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callback()
      }
    }, intervalMs)
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      callback()
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
