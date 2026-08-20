/** Removes service workers left behind by versions that previously registered one. */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    .catch(() => {
      // Cleanup is best-effort; an unavailable service worker API must not block the app.
    })
})
