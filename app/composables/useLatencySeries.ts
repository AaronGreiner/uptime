import type { LatencySeries, LatencySpread } from '#shared/types/monitor'
import {
  DEFAULT_LATENCY_SERIES,
  DEFAULT_LATENCY_SPREAD,
  isLatencySeriesSelection,
  isLatencySpread,
  LATENCY_SERIES,
  normalizeLatencySeries
} from '#shared/utils/monitor'

/**
 * Which curves every response time chart draws — the detail page and every
 * latency widget read this one value, so a dashboard shows what the reader last
 * asked for wherever they asked for it.
 *
 * Shared state rather than a preference read per caller, for the same reason
 * the monitor path format is: Nuxt builds a separate ref on every `useCookie`
 * call, and two of them only ever agree where the browser has a `cookieStore`.
 * A dashboard holding three charts would otherwise leave two of them behind.
 */
export function useLatencySeries() {
  return useState<LatencySeries[]>('latency-series', () => [...DEFAULT_LATENCY_SERIES])
}

/**
 * How the spread between the two bounds is drawn. The reader's default; a
 * widget may insist on one of its own through `config.spread`.
 */
export function useLatencySpread() {
  return useState<LatencySpread>('latency-spread', () => DEFAULT_LATENCY_SPREAD)
}

/**
 * Binds both of those to their cookies. Called once, from the dashboard
 * layout, so the server already renders the chart the browser is about to show
 * instead of redrawing it after hydration.
 */
export function useLatencyChartPreferences() {
  const series = useLatencySeries()
  const storedSeries = useUiPreference<LatencySeries[]>(
    'latency-series',
    () => [...DEFAULT_LATENCY_SERIES],
    isLatencySeriesSelection
  )

  const spread = useLatencySpread()
  const storedSpread = useUiPreference<LatencySpread>(
    'latency-spread',
    () => DEFAULT_LATENCY_SPREAD,
    isLatencySpread
  )

  series.value = normalizeLatencySeries(storedSeries.value)
  spread.value = storedSpread.value

  // Any control may write the shared state; the cookies are written from here,
  // the one place holding a reference to them.
  watch(series, (value) => {
    storedSeries.value = value
  })

  watch(spread, (value) => {
    storedSpread.value = value
  })
}

/**
 * Reading and writing a single curve, for the controls that offer them.
 *
 * The last curve left on cannot be turned off: an empty chart is not a reading,
 * and a reader who has just hidden everything has no way of telling a setting
 * from a monitor that never answered.
 */
export function useLatencySeriesToggle() {
  const series = useLatencySeries()

  function shows(entry: LatencySeries): boolean {
    return series.value.includes(entry)
  }

  function toggle(entry: LatencySeries) {
    if (!shows(entry)) {
      series.value = normalizeLatencySeries([...series.value, entry])
      return
    }

    if (series.value.length > 1) {
      series.value = series.value.filter(current => current !== entry)
    }
  }

  /** The last one on: offered as a disabled control rather than a silent no-op. */
  function isLocked(entry: LatencySeries): boolean {
    return shows(entry) && series.value.length === 1
  }

  return { series, entries: LATENCY_SERIES, shows, toggle, isLocked }
}
