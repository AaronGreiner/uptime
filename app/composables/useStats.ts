import type { Incident, IncidentSummary } from '#shared/types/incident'
import type { MonitorDailyPoint, MonitorStatsPoint, MonitorUptime } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'

/**
 * How long a figure of this range may lag behind the live stream.
 *
 * A single check moves a 30 day percentage in its fifth decimal but costs a full
 * aggregate scan, so the refetch is throttled the longer the window gets. The
 * two short ranges refetch immediately, because there the check is the point.
 */
const REFRESH_THROTTLE_MS: Record<StatsRange, number> = {
  '1h': 0,
  '24h': 0,
  '7d': 30_000,
  '30d': 60_000,
  '1y': 300_000
}

/**
 * Runs `refresh` at most once per interval, with a trailing call so the last
 * result inside a burst is never the one that gets dropped.
 */
function useThrottledRefresh(refresh: () => unknown, intervalMs: MaybeRefOrGetter<number>) {
  let lastRun = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  onScopeDispose(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })

  return () => {
    const wait = toValue(intervalMs)
    const due = lastRun + wait - Date.now()

    if (due <= 0) {
      lastRun = Date.now()
      void refresh()
      return
    }

    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        lastRun = Date.now()
        void refresh()
      }, due)
    }
  }
}

interface MonitorStatsResponse {
  points: MonitorStatsPoint[]
  uptime: MonitorUptime
}

/**
 * Chart buckets and uptime of one monitor.
 *
 * Keyed by monitor and range rather than by widget, so two widgets showing the
 * same thing share one request instead of racing each other for it.
 */
export function useMonitorStats(
  monitorId: MaybeRefOrGetter<number | null>,
  range: MaybeRefOrGetter<StatsRange>
) {
  const id = computed(() => toValue(monitorId))
  const window = computed(() => toValue(range))

  const state = useAsyncData<MonitorStatsResponse | null>(
    () => `monitor-stats-${id.value ?? 'none'}-${window.value}`,
    () => id.value
      ? $fetch<MonitorStatsResponse>(`/api/monitors/${id.value}/stats`, { query: { range: window.value } })
      : Promise.resolve(null),
    { watch: [id, window] }
  )

  const scheduleRefresh = useThrottledRefresh(state.refresh, () => REFRESH_THROTTLE_MS[window.value])

  onMonitorChecked(() => scheduleRefresh(), id)

  return state
}

interface MonitorDailyResponse {
  days: number
  points: MonitorDailyPoint[]
}

/**
 * Minutes the viewer's zone is ahead of UTC. Resolved once per render rather
 * than per caller: the value has to be the same on the server and on the
 * client, or hydration rewrites every square — and whoever reads the buckets
 * back has to align them with the very same offset they were cut with.
 */
export function useUtcOffsetMinutes(): Ref<number> {
  return useState('utc-offset', () => -new Date().getTimezoneOffset())
}

/** Daily uptime of one monitor, aligned to the reader's own midnight. */
export function useMonitorDaily(monitorId: MaybeRefOrGetter<number | null>, days: MaybeRefOrGetter<number>) {
  const id = computed(() => toValue(monitorId))
  const span = computed(() => toValue(days))
  const offsetMinutes = useUtcOffsetMinutes()

  const state = useAsyncData<MonitorDailyResponse | null>(
    () => `monitor-daily-${id.value ?? 'none'}-${span.value}`,
    () => id.value
      ? $fetch<MonitorDailyResponse>(`/api/monitors/${id.value}/daily`, {
          query: { days: span.value, offsetMinutes: offsetMinutes.value }
        })
      : Promise.resolve(null),
    { watch: [id, span] }
  )

  const scheduleRefresh = useThrottledRefresh(state.refresh, REFRESH_THROTTLE_MS['30d'])

  onMonitorChecked(() => scheduleRefresh(), id)

  return state
}

interface ScopeUptimeResponse {
  range: StatsRange
  monitors: Array<{ monitorId: number, uptime: MonitorUptime }>
}

/** Uptime for a whole widget scope, in one request rather than one per row. */
export function useScopeUptime(
  scopedIds: MaybeRefOrGetter<number[]>,
  isAll: MaybeRefOrGetter<boolean>,
  range: MaybeRefOrGetter<StatsRange>
) {
  const ids = computed(() => toValue(isAll) ? null : toValue(scopedIds))
  const window = computed(() => toValue(range))

  const state = useAsyncData<ScopeUptimeResponse>(
    () => `scope-uptime-${ids.value?.join(',') ?? 'all'}-${window.value}`,
    () => $fetch<ScopeUptimeResponse>('/api/stats/uptime', {
      query: { ids: ids.value?.join(',') || undefined, range: window.value }
    }),
    { watch: [ids, window], default: () => ({ range: toValue(range), monitors: [] }) }
  )

  /*
   * A reactive key has a moment with no entry behind it: this one is derived
   * from the widget's scope, which resolves against the group cache, so the key
   * changes the instant that cache arrives and `data` reads undefined until the
   * request for the new key exists.
   */
  const byMonitor = computed(() => new Map((state.data.value?.monitors ?? []).map(entry => [entry.monitorId, entry.uptime])))
  const scheduleRefresh = useThrottledRefresh(state.refresh, () => REFRESH_THROTTLE_MS[window.value])

  onMonitorChecked((event) => {
    if (ids.value === null || ids.value.includes(event.monitorId)) {
      scheduleRefresh()
    }
  })

  return { ...state, byMonitor }
}

interface IncidentResponse {
  range: StatsRange
  summary: IncidentSummary
  incidents: Incident[]
}

const EMPTY_SUMMARY: IncidentSummary = {
  count: 0,
  ongoing: 0,
  totalDownSeconds: 0,
  longestSeconds: null,
  mttrSeconds: null,
  mtbfSeconds: null
}

/** Reconstructed outages plus the reliability figures over the same window. */
export function useScopeIncidents(
  scopedIds: MaybeRefOrGetter<number[]>,
  isAll: MaybeRefOrGetter<boolean>,
  range: MaybeRefOrGetter<StatsRange>,
  limit: MaybeRefOrGetter<number>
) {
  const ids = computed(() => toValue(isAll) ? null : toValue(scopedIds))
  const window = computed(() => toValue(range))
  const rows = computed(() => toValue(limit))

  const state = useAsyncData<IncidentResponse>(
    () => `scope-incidents-${ids.value?.join(',') ?? 'all'}-${window.value}-${rows.value}`,
    () => $fetch<IncidentResponse>('/api/incidents', {
      query: { ids: ids.value?.join(',') || undefined, range: window.value, limit: rows.value }
    }),
    {
      watch: [ids, window, rows],
      default: (): IncidentResponse => ({ range: toValue(range), summary: EMPTY_SUMMARY, incidents: [] })
    }
  )

  const scheduleRefresh = useThrottledRefresh(state.refresh, () => REFRESH_THROTTLE_MS[window.value])

  onMonitorChecked((event) => {
    if (ids.value === null || ids.value.includes(event.monitorId)) {
      scheduleRefresh()
    }
  })

  return state
}
