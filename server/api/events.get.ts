import { nowInSeconds } from '../services/scheduler'

/**
 * Server sent events carrying every check result the moment it lands. Public
 * like the rest of the read endpoints, and read only by nature.
 */
export default defineEventHandler((event) => {
  // Reverse proxies buffer streamed responses unless they are told not to,
  // which would defeat the whole point of the endpoint.
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const stream = createEventStream(event)

  const unsubscribe = onLiveEvent((liveEvent) => {
    void stream.push(JSON.stringify(liveEvent))
  })

  // A named event rather than a message, so the client never has to parse it.
  const ping = () => stream.push({ event: 'ping', data: String(nowInSeconds()) })

  // Nothing is written until the first event, and the response headers go out
  // with it, so the browser would not report the stream as open until then.
  void ping()

  const keepAlive = setInterval(() => {
    void ping()
  }, LIVE_KEEP_ALIVE_MS)

  // Never keep the process alive just for an open browser tab.
  keepAlive.unref?.()

  stream.onClosed(async () => {
    unsubscribe()
    clearInterval(keepAlive)
    await stream.close()
  })

  return stream.send()
})
