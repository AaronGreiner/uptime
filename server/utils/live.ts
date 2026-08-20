import type { LiveEvent } from '../../shared/types/live'

/** How often an idle stream sends a comment so proxies keep it open. */
export const LIVE_KEEP_ALIVE_MS = 25_000

type LiveListener = (event: LiveEvent) => void

/**
 * In process fan out to the open event streams. A single node application needs
 * nothing more: there is no second instance a message would have to reach.
 */
const listeners = new Set<LiveListener>()

/** Subscribes a stream. The returned function detaches it again. */
export function onLiveEvent(listener: LiveListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** Whether anything is listening, so a payload is only built when it is read. */
export function hasLiveListeners(): boolean {
  return listeners.size > 0
}

/**
 * Hands an event to every open stream. Like the notification dispatcher this
 * swallows failures: a browser that went away may never break a check.
 */
export function publishLiveEvent(event: LiveEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('[live] listener failed:', error)
    }
  }
}
