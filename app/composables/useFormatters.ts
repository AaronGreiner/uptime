/** Shared clock so every relative timestamp on the page updates together. */
export function useNow(intervalMs = 15_000) {
  const now = useState('clock', () => Date.now())

  usePolling(() => {
    now.value = Date.now()
  }, intervalMs)

  return now
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1]
]

/** Locale aware formatting helpers used across cards, tables and charts. */
export function useFormatters() {
  const { locale, t } = useI18n()
  const now = useNow()

  const relativeTimeFormat = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))
  const dateTimeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }))
  const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
  const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }))
  const numberFormat = computed(() => new Intl.NumberFormat(locale.value))

  function formatRelativeTime(unixSeconds: number | null | undefined): string {
    if (!unixSeconds) {
      return t('common.never')
    }

    const deltaSeconds = unixSeconds - Math.floor(now.value / 1000)
    const magnitude = Math.abs(deltaSeconds)
    const [unit, size] = RELATIVE_UNITS.find(([, seconds]) => magnitude >= seconds) ?? RELATIVE_UNITS.at(-1)!

    return relativeTimeFormat.value.format(Math.round(deltaSeconds / size), unit)
  }

  function formatDateTime(unixSeconds: number | null | undefined): string {
    return unixSeconds ? dateTimeFormat.value.format(unixSeconds * 1000) : t('common.never')
  }

  function formatDate(unixSeconds: number | null | undefined): string {
    return unixSeconds ? dateFormat.value.format(unixSeconds * 1000) : t('common.never')
  }

  function formatTime(unixSeconds: number): string {
    return timeFormat.value.format(unixSeconds * 1000)
  }

  /** Compact duration such as `30 s`, `5 min` or `2 h`. */
  function formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${numberFormat.value.format(seconds)} s`
    }

    if (seconds < 3600) {
      return `${numberFormat.value.format(Math.round(seconds / 60))} min`
    }

    if (seconds < 86_400) {
      return `${numberFormat.value.format(Math.round(seconds / 3600))} h`
    }

    return `${numberFormat.value.format(Math.round(seconds / 86_400))} d`
  }

  function formatLatency(milliseconds: number | null | undefined): string {
    return milliseconds === null || milliseconds === undefined
      ? '—'
      : `${numberFormat.value.format(Math.round(milliseconds))} ms`
  }

  /**
   * Uptime is shown with two decimals because the difference between 99.9 % and
   * 100 % is the whole point of the number.
   */
  function formatUptime(ratio: number | null | undefined): string {
    if (ratio === null || ratio === undefined) {
      return '—'
    }

    return new Intl.NumberFormat(locale.value, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(ratio)
  }

  function formatNumber(value: number): string {
    return numberFormat.value.format(value)
  }

  return {
    formatRelativeTime,
    formatDateTime,
    formatDate,
    formatTime,
    formatDuration,
    formatLatency,
    formatUptime,
    formatNumber
  }
}
