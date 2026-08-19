import type { MonitorWithState } from '#shared/types/monitor'

/** Shared monitor list. Every caller reuses the same request and cache entry. */
export function useMonitors() {
  return useAsyncData<MonitorWithState[]>('monitors', () => $fetch('/api/monitors'), {
    default: () => []
  })
}

export function useMonitor(id: MaybeRefOrGetter<number>) {
  const monitorId = computed(() => toValue(id))

  return useAsyncData<MonitorWithState>(
    () => `monitor-${monitorId.value}`,
    () => $fetch(`/api/monitors/${monitorId.value}`),
    { watch: [monitorId] }
  )
}
