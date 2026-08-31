import type { LatencyChartStyle } from '#shared/types/monitor'
import { DEFAULT_LATENCY_CHART_STYLE, isLatencyChartStyle } from '#shared/utils/monitor'

/**
 * How every response time chart is drawn — the detail page and every latency
 * widget read this one value, so a dashboard shows what the reader last asked
 * for wherever they asked for it.
 *
 * Shared state rather than a preference read per caller, for the same reason
 * the monitor path format is: Nuxt builds a separate ref on every `useCookie`
 * call, and two of them only ever agree where the browser has a `cookieStore`.
 * A dashboard holding three charts would otherwise leave two of them behind.
 */
export function useLatencyChartStyle() {
  return useState<LatencyChartStyle>('latency-chart-style', () => DEFAULT_LATENCY_CHART_STYLE)
}

/**
 * Binds that shared state to its cookie. Called once, from the dashboard
 * layout, so the server already renders the chart the browser is about to show
 * instead of redrawing it after hydration.
 */
export function useLatencyChartStylePreference() {
  const style = useLatencyChartStyle()
  const stored = useUiPreference<LatencyChartStyle>(
    'latency-chart-style',
    () => DEFAULT_LATENCY_CHART_STYLE,
    isLatencyChartStyle
  )

  style.value = stored.value

  // Any control may write the shared state; the cookie is written from here,
  // the one place holding a reference to it.
  watch(style, (value) => {
    stored.value = value
  })
}
