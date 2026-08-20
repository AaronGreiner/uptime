const tombstone = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => Promise.all(clients.map(client => client.navigate(client.url))))
  )
})
`

/**
 * Replaces and unregisters the service worker used by an older development
 * setup. Keeping the tombstone route prevents that worker from serving stale
 * assets after the application itself has stopped registering it.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'application/javascript; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store, max-age=0')
  return tombstone
})
