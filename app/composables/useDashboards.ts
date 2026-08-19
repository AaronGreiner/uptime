import type { Dashboard, DashboardWithWidgets } from '#shared/types/dashboard'

export function useDashboards() {
  return useAsyncData<Dashboard[]>('dashboards', () => $fetch('/api/dashboards'), {
    default: () => []
  })
}

export function useDashboard(slug: MaybeRefOrGetter<string>) {
  const key = computed(() => toValue(slug))

  return useAsyncData<DashboardWithWidgets>(
    () => `dashboard-${key.value}`,
    () => $fetch(`/api/dashboards/${key.value}`),
    { watch: [key] }
  )
}
