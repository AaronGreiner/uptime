export interface StatusSummary {
  total: number
  up: number
  down: number
  pending: number
  paused: number
  uptime24h: number | null
}

export function useStatusSummary() {
  return useAsyncData<StatusSummary>('status-summary', () => $fetch('/api/status'), {
    default: () => ({ total: 0, up: 0, down: 0, pending: 0, paused: 0, uptime24h: null })
  })
}
