/**
 * A rejected promise nobody awaited is fatal on bun as it is on node, and a
 * browser dropping a connection is enough to produce one somewhere down the
 * stack. Losing the process means losing the scheduler, so a stray rejection is
 * logged and swallowed here, the way the notification dispatcher contains a
 * broken transport. It is the net, not the fix: whatever shows up in the log
 * still has a cause worth removing.
 */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) {
    return
  }

  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandled promise rejection:', reason)
  })
})
