<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { isAdmin } = useAdmin()
const router = useRouter()
const appName = useRuntimeConfig().public.appName

const { data: dashboards, refresh: refreshDashboards } = useDashboards()
const { data: monitors, refresh: refreshMonitors } = useMonitors()
const { refresh: refreshSummary } = useStatusSummary()

// One polling loop for the whole application: every page reads the same caches.
usePolling(() => {
  refreshMonitors()
  refreshSummary()
}, 10_000)

const createDashboardOpen = ref(false)

const navigation = computed<NavigationMenuItem[][]>(() => {
  const groups: NavigationMenuItem[][] = [[
    { label: t('nav.dashboards'), type: 'label' },
    ...dashboards.value.map(dashboard => ({
      label: dashboard.name,
      icon: dashboard.isDefault ? 'i-lucide-layout-dashboard' : 'i-lucide-layout-panel-left',
      to: `/d/${dashboard.slug}`
    })),
    ...(isAdmin.value
      ? [{
          label: t('dashboard.create'),
          icon: 'i-lucide-plus',
          onSelect: () => { createDashboardOpen.value = true }
        }]
      : [])
  ], [
    { label: t('nav.monitoring'), type: 'label' },
    {
      label: t('nav.monitors'),
      icon: 'i-lucide-activity',
      to: '/monitors',
      badge: monitors.value.length || undefined
    }
  ]]

  if (isAdmin.value) {
    groups.push([
      { label: t('nav.settings'), type: 'label' },
      { label: t('settings.account'), icon: 'i-lucide-user-cog', to: '/settings' }
    ])
  }

  return groups
})

async function onDashboardCreated(slug: string) {
  await refreshDashboards()
  await router.push(`/d/${slug}`)
}
</script>

<template>
  <UDashboardGroup
    unit="rem"
    storage="local"
    storage-key="uptime-sidebar"
  >
    <UDashboardSidebar
      id="uptime"
      collapsible
      resizable
      :min-size="13"
      :default-size="15"
      :max-size="24"
      :ui="{
        footer: 'flex-col items-stretch gap-2 border-t border-default',
        header: 'gap-2'
      }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/"
          class="flex items-center gap-2 min-w-0 font-semibold text-highlighted"
        >
          <AppLogo class="size-7 shrink-0" />
          <span
            v-if="!collapsed"
            class="truncate-target"
          >{{ appName }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="navigation"
          :collapsed="collapsed"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <AppSidebarStatus :collapsed="collapsed" />

        <div
          class="flex items-center gap-1"
          :class="collapsed ? 'flex-col' : ''"
        >
          <AppUserMenu :collapsed="collapsed" />

          <div
            class="flex items-center gap-1"
            :class="collapsed ? 'flex-col' : 'ms-auto'"
          >
            <AppLocaleSelect :collapsed="collapsed" />
            <UColorModeButton />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />

    <DashboardFormModal
      v-if="isAdmin"
      v-model:open="createDashboardOpen"
      @saved="onDashboardCreated($event.slug)"
    />
  </UDashboardGroup>
</template>
