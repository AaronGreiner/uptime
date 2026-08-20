import type { LiveEvent } from '#shared/types/live'

/** Delay before a stream the browser gave up on is opened again. */
const RETRY_DELAY_MS = 5_000

type LiveListener = (event: LiveEvent) => void

export interface LiveConnection {
  /** True while the event stream is open and results are arriving. */
  connected: Readonly<Ref<boolean>>
  /** Subscribes to every pushed event. The returned function detaches again. */
  subscribe: (listener: LiveListener) => () => void
  /**
   * Fires whenever the stream comes back after having been away, never on the
   * first connect. Whatever was missed in between has to be reloaded there.
   */
  onResumed: (listener: () => void) => () => void
}

/**
 * One event stream per browser tab, shared by every page and component. The
 * scheduler pushes each check result through it, which is what makes the
 * dashboard live instead of merely recent.
 *
 * The stream is closed while the tab is hidden. Browsers cap the connections per
 * origin, and a handful of background tabs holding one open each would starve
 * the ordinary requests of the tab actually in front of the user.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const connected = ref(false)
  const listeners = new Set<LiveListener>()
  const resumeListeners = new Set<() => void>()

  let source: EventSource | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  /** False until the first successful connect, so it does not count as a resume. */
  let everConnected = false

  function close() {
    source?.close()
    source = null
    connected.value = false
  }

  function open() {
    if (source) {
      return
    }

    source = new EventSource('/api/events')

    source.onopen = () => {
      connected.value = true

      if (everConnected) {
        for (const listener of resumeListeners) {
          listener()
        }
      }

      everConnected = true
    }

    source.onmessage = (message) => {
      let event: LiveEvent

      try {
        event = JSON.parse(message.data)
      } catch {
        // A frame we cannot read is not worth tearing the stream down for.
        return
      }

      for (const listener of listeners) {
        listener(event)
      }
    }

    source.onerror = () => {
      connected.value = false

      // The browser retries on its own unless it has given up for good.
      if (source?.readyState === EventSource.CLOSED) {
        close()
        retry = setTimeout(open, RETRY_DELAY_MS)
      }
    }
  }

  if (import.meta.client) {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        open()
        return
      }

      if (retry) {
        clearTimeout(retry)
        retry = null
      }

      close()
    }

    // Only once the markup is on the page: a result arriving mid hydration would
    // rewrite the very data hydration is about to compare.
    nuxtApp.hook('app:mounted', () => {
      document.addEventListener('visibilitychange', onVisibilityChange)
      open()
    })
  }

  const live: LiveConnection = {
    connected: readonly(connected),

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    onResumed(listener) {
      resumeListeners.add(listener)

      return () => {
        resumeListeners.delete(listener)
      }
    }
  }

  return { provide: { live } }
})
