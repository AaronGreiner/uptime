import { nowInSeconds } from '../services/scheduler'

/**
 * Server sent events carrying every check result the moment it lands. Public
 * like the rest of the read endpoints, and read only by nature.
 *
 * The frames are written by hand rather than through h3's `createEventStream`.
 * That helper reports a dropped connection by rejecting promises this handler
 * cannot reach: the runtime cancels the response stream, which errors the
 * writer behind the helper, and the unhandled rejection that follows ends the
 * whole process — taking the scheduler down with it. A plain readable stream is
 * cancelled instead, and enqueuing onto a cancelled one throws where it can be
 * caught.
 */
export default defineEventHandler((event) => {
  const encoder = new TextEncoder()

  let unsubscribe: (() => void) | null = null
  let keepAlive: ReturnType<typeof setInterval> | null = null

  /** Detaches everything the stream holds. Safe to call more than once. */
  function release() {
    unsubscribe?.()
    unsubscribe = null

    if (keepAlive) {
      clearInterval(keepAlive)
      keepAlive = null
    }
  }

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'private, no-cache, no-store, no-transform, must-revalidate, max-age=0',
    // Reverse proxies buffer streamed responses unless they are told not to,
    // which would defeat the whole point of the endpoint.
    'X-Accel-Buffering': 'no'
  })

  return new ReadableStream<Uint8Array>({
    start(controller) {
      /** Writes one frame, or lets go of a client that is no longer there. */
      const write = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame))
        } catch {
          release()
        }
      }

      unsubscribe = onLiveEvent((liveEvent) => {
        write(`data: ${JSON.stringify(liveEvent)}\n\n`)
      })

      // A named event rather than a message, so the client never has to parse
      // it.
      const ping = () => write(`event: ping\ndata: ${nowInSeconds()}\n\n`)

      // Nothing is written until the first frame, and the response headers go
      // out with it, so the browser would not report the stream as open before.
      ping()

      keepAlive = setInterval(ping, LIVE_KEEP_ALIVE_MS)

      // Never keep the process alive just for an open browser tab.
      keepAlive.unref?.()
    },

    cancel() {
      release()
    }
  })
})
