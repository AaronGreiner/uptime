import { and, asc, eq, lte } from 'drizzle-orm'
import type { NotificationEvent } from '../../../shared/types/notification'
import { notificationChannels, notificationDeliveries } from '../../database/schema'
import type { NotificationChannelRow, NotificationDeliveryRow } from '../../database/schema'
import { nowInSeconds } from '../scheduler'
import { getNotificationProvider } from './registry'

/**
 * Delay before each further attempt of one delivery. The last value repeats,
 * which only matters if `notifications.maxAttempts` is raised above four.
 */
const RETRY_BACKOFF_SECONDS = [30, 120, 600]

/** Errors are stored, and a transport may hand back an entire HTML page. */
const MAX_ERROR_LENGTH = 500

/**
 * Grace on top of the deadline every provider enforces for itself. Reaching it
 * means one of them failed to, which is a bug rather than a slow server.
 */
const SEND_WATCHDOG_GRACE_MS = 5000

let timer: NodeJS.Timeout | null = null
let running = false

/**
 * Delivers queued notifications, away from the check pipeline.
 *
 * A transport that accepts a connection and then goes quiet is common enough to
 * design for: on the check path it would hold the monitor in the scheduler's
 * in-flight set and stop it from ever being checked again. Here it costs one
 * delivery attempt.
 */
export function startNotificationQueue(): void {
  const { notifications } = useRuntimeConfig()

  if (!notifications.enabled) {
    console.info('[notifications] disabled via configuration, nothing will be delivered')
    return
  }

  if (timer) {
    return
  }

  timer = setInterval(() => {
    void runNotificationQueue()
  }, notifications.tickIntervalMs)

  timer.unref?.()
}

export function stopNotificationQueue(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export async function runNotificationQueue(): Promise<void> {
  // A tick can outlast its interval, and picking the same rows twice would send
  // the same message twice.
  if (running) {
    return
  }

  running = true

  try {
    const { notifications } = useRuntimeConfig()
    const due = useDatabase()
      .select()
      .from(notificationDeliveries)
      .where(and(
        eq(notificationDeliveries.status, 'pending'),
        lte(notificationDeliveries.nextAttemptAt, nowInSeconds())
      ))
      .orderBy(asc(notificationDeliveries.nextAttemptAt), asc(notificationDeliveries.id))
      .limit(notifications.concurrency)
      .all()

    await Promise.all(due.map(delivery => deliver(delivery)))
  } catch (error) {
    // An unhandled rejection ends the bun process and systemd restarts it, which
    // turns every request in that window into a 502.
    console.error('[notifications] queue run failed:', error)
  } finally {
    running = false
  }
}

async function deliver(delivery: NotificationDeliveryRow): Promise<void> {
  const channel = useDatabase()
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, delivery.channelId))
    .get()

  if (!channel) {
    recordFailure(delivery, 'Channel no longer exists', { permanent: true })
    return
  }

  // Retrying would mean waiting for a human, and a delivery left pending forever
  // is worse than one that says why it stopped.
  if (!channel.enabled) {
    recordFailure(delivery, 'Channel is disabled', { permanent: true })
    return
  }

  // Providers are registered once at boot, so one that is missing now will still
  // be missing in ten minutes. Retrying would only delay the explanation.
  if (!getNotificationProvider(channel.provider)) {
    recordFailure(delivery, `No provider registered for "${channel.provider}"`, {
      permanent: true,
      channelId: channel.id
    })
    return
  }

  try {
    await sendThroughChannel(channel, delivery.payload)
    recordSuccess(delivery, channel.id)
  } catch (error) {
    recordFailure(delivery, describeError(error), { channelId: channel.id })
  }
}

/**
 * Hands one event to one channel and throws if it does not arrive. Used by the
 * queue and by the test send, so both go through the same watchdog.
 */
export async function sendThroughChannel(channel: NotificationChannelRow, event: NotificationEvent): Promise<void> {
  const { notifications } = useRuntimeConfig()
  const provider = getNotificationProvider(channel.provider)

  if (!provider) {
    throw new Error(`No provider registered for "${channel.provider}"`)
  }

  const config = provider.validateConfig(channel.config)
  const send = provider.send(event, { config, language: channel.language, channelName: channel.name })

  await withWatchdog(send, notifications.sendTimeoutMs + SEND_WATCHDOG_GRACE_MS, `${provider.id} channel ${channel.id}`)
}

/**
 * Last line of defence around a transport that never settles. Every provider is
 * expected to enforce its own timeout; reaching this deadline means one did not.
 */
function withWatchdog(send: Promise<void>, deadlineMs: number, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error(`[notifications] ${label} did not settle within ${deadlineMs}ms`)

      reject(new Error(`Delivery did not return within ${Math.round(deadlineMs / 1000)}s`))
    }, deadlineMs)

    // Attaching to the abandoned promise keeps a late rejection handled: an
    // unhandled one terminates the bun process.
    send.then(
      () => {
        clearTimeout(timeout)
        resolve()
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

function recordSuccess(delivery: NotificationDeliveryRow, channelId: number): void {
  const database = useDatabase()
  const now = nowInSeconds()

  database.transaction((transaction) => {
    transaction
      .update(notificationDeliveries)
      .set({ status: 'sent', attempts: delivery.attempts + 1, lastError: null, deliveredAt: now })
      .where(eq(notificationDeliveries.id, delivery.id))
      .run()

    // `updatedAt` stays untouched on purpose: it means "the configuration
    // changed", and delivery bookkeeping is not a configuration change.
    transaction
      .update(notificationChannels)
      .set({ lastSuccessAt: now, lastError: null, lastErrorAt: null })
      .where(eq(notificationChannels.id, channelId))
      .run()
  })
}

function recordFailure(
  delivery: NotificationDeliveryRow,
  message: string,
  options: { permanent?: boolean, channelId?: number } = {}
): void {
  const database = useDatabase()
  const { notifications } = useRuntimeConfig()
  const now = nowInSeconds()
  const attempts = delivery.attempts + 1
  const exhausted = options.permanent === true || attempts >= notifications.maxAttempts
  const backoff = RETRY_BACKOFF_SECONDS[Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)] ?? 600

  database.transaction((transaction) => {
    transaction
      .update(notificationDeliveries)
      .set({
        status: exhausted ? 'failed' : 'pending',
        attempts,
        lastError: message,
        nextAttemptAt: exhausted ? delivery.nextAttemptAt : now + backoff
      })
      .where(eq(notificationDeliveries.id, delivery.id))
      .run()

    // Only a channel that was actually reached gets its error state updated: a
    // delivery abandoned because the channel was switched off is not a fault of
    // the channel and should not be shown as one.
    if (options.channelId !== undefined) {
      transaction
        .update(notificationChannels)
        .set({ lastError: message, lastErrorAt: now })
        .where(eq(notificationChannels.id, options.channelId))
        .run()
    }
  })

  if (exhausted) {
    console.error(`[notifications] delivery ${delivery.id} gave up after ${attempts} attempts: ${message}`)
  }
}

export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message
}
