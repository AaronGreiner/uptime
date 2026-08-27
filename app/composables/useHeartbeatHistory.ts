import type { Heartbeat } from '#shared/types/monitor'
import { MONITOR_HEARTBEAT_HISTORY_MAX } from '#shared/utils/monitor'

interface HeartbeatHistoryEntry {
  heartbeats: Heartbeat[]
  fulfilledLimit: number
}

interface ActiveHeartbeatRequest {
  limit: number
  promise: Promise<void>
}

/** Requests in flight in this browser tab, shared by duplicate monitor widgets. */
const activeRequests = new Map<number, ActiveHeartbeatRequest>()

function mergeHeartbeats(lists: Heartbeat[][], limit: number): Heartbeat[] {
  const byId = new Map<number, Heartbeat>()

  for (const list of lists) {
    for (const heartbeat of list) {
      byId.set(heartbeat.id, heartbeat)
    }
  }

  return [...byId.values()]
    .sort((left, right) => left.checkedAt - right.checkedAt || left.id - right.id)
    .slice(-limit)
}

/**
 * Extends the heartbeat history carried by the monitor list only when a pulse
 * bar is wide enough to need it. The cache is shared by every rendering of the
 * same monitor, while the list payload can stay at its compact baseline size.
 */
export function useHeartbeatHistory(
  monitorId: MaybeRefOrGetter<number>,
  source: MaybeRefOrGetter<Heartbeat[]>
) {
  const histories = useState<Record<number, HeartbeatHistoryEntry>>('heartbeat-histories', () => ({}))
  const id = computed(() => toValue(monitorId))

  const heartbeats = computed(() => {
    const entry = histories.value[id.value]
    const initial = toValue(source)

    if (!entry) {
      return initial
    }

    return mergeHeartbeats([entry.heartbeats, initial], entry.fulfilledLimit)
  })

  /** Keep an extended cache moving forward with the shared list and live data. */
  watch([id, () => toValue(source)], ([currentId, initial]) => {
    const entry = histories.value[currentId]

    if (!entry) {
      return
    }

    histories.value[currentId] = {
      ...entry,
      heartbeats: mergeHeartbeats([entry.heartbeats, initial], entry.fulfilledLimit)
    }
  })

  async function ensure(limit: number, force = false): Promise<void> {
    const currentId = id.value
    const requestedLimit = Math.min(MONITOR_HEARTBEAT_HISTORY_MAX, Math.max(1, Math.ceil(limit)))
    const entry = histories.value[currentId]

    if (!force && entry && entry.fulfilledLimit >= requestedLimit) {
      return
    }

    const active = activeRequests.get(currentId)

    if (active) {
      await active.promise

      if (active.limit >= requestedLimit) {
        return
      }
    }

    const promise = $fetch<Heartbeat[]>(`/api/monitors/${currentId}/heartbeats`, {
      query: { limit: requestedLimit }
    }).then((loaded) => {
      const previous = histories.value[currentId]
      const fulfilledLimit = Math.max(previous?.fulfilledLimit ?? 0, requestedLimit)

      histories.value[currentId] = {
        fulfilledLimit,
        heartbeats: mergeHeartbeats([
          previous?.heartbeats ?? [],
          loaded,
          currentId === id.value ? toValue(source) : []
        ], fulfilledLimit)
      }
    }).catch(() => {
      // The compact list history still renders when this optional extension
      // fails. A resize or resumed live stream will try the request again.
    })

    activeRequests.set(currentId, { limit: requestedLimit, promise })

    try {
      await promise
    } finally {
      if (activeRequests.get(currentId)?.promise === promise) {
        activeRequests.delete(currentId)
      }
    }
  }

  return { heartbeats, ensure }
}
