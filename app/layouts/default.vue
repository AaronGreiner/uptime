<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { isAdmin } = useAdmin()
const router = useRouter()
const appName = useRuntimeConfig().public.appName

const { data: dashboards, refresh: refreshDashboards } = useDashboards()

// One live connection for the whole application: every page reads the same
// monitor cache, and the check results are pushed straight into it. Groups are
// left out on purpose, they only change when the admin edits them.
useLiveMonitors()

// Binds the breadcrumb format to its cookie, once, for every label below.
useMonitorPathPreference()

// The same for the response time charts, whose style the detail page and the
// dashboard tiles share.
useLatencyChartStylePreference()

// The zone the maintenance windows are written in, read once for every form
// that draws one. The monitor states themselves arrive resolved from the server.
await useMaintenanceSettings()

// A dashboard opened in fullscreen renders without this sidebar. The listeners
// that end the mode are global, so they are bound here rather than on the page.
const { isFullscreen } = useFullscreen()
useFullscreenSync()

const createDashboardOpen = ref(false)

const dashboardNavigation = computed<NavigationMenuItem[]>(() => [
  { label: t('nav.dashboards'), type: 'label' },
  ...dashboards.value.map(dashboard => ({
    label: dashboard.name,
    icon: dashboardIcon(dashboard),
    to: `/d/${dashboard.slug}`
  })),
  ...(isAdmin.value
    ? [{
        label: t('dashboard.create'),
        icon: 'i-lucide-plus',
        onSelect: () => { createDashboardOpen.value = true }
      }]
    : [])
])

async function onDashboardCreated(slug: string) {
  await refreshDashboards()
  await router.push(`/d/${slug}`)
}
</script>

<template>
  <UDashboardGroup
    unit="rem"
    storage="cookie"
    storage-key="uptime-sidebar"
    :storage-options="{ maxAge: UI_PREFERENCE_MAX_AGE_SECONDS, sameSite: 'lax', path: '/' }"
  >
    <AppUplinkBanner />

    <UDashboardSidebar
      v-if="!isFullscreen"
      id="uptime"
      collapsible
      resizable
      :min-size="13"
      :collapsed-size="4"
      :default-size="15"
      :max-size="24"
      :ui="{
        // No divider towards the content: the panel already reads as its own
        // surface. The vertical padding lines the brand up with the navbar.
        root: 'border-none py-3 sm:py-4 transition-[width] duration-300 ease-out motion-reduce:transition-none data-[dragging=true]:transition-none',
        // The three navigation blocks sit closer together than the theme's
        // default, so a section reads as a break rather than as a new screen.
        body: 'gap-2',
        footer: 'flex-col items-stretch gap-2',
        header: 'gap-2'
      }"
    >
      <template #header="{ collapsed }">
        <!-- Collapsed the mark is the only thing left in the rail, so it lines
             up with the navigation icons below instead of with the label. -->
        <NuxtLink
          to="/"
          class="flex items-center gap-2 min-w-0 font-semibold text-highlighted"
          :class="collapsed ? 'w-full justify-center' : ''"
        >
          <AppLogo class="size-7 shrink-0" />
          <span
            v-if="!collapsed"
            class="truncate-target"
          >{{ appName }}</span>
        </NuxtLink>
      </template>

      <!--
        Three separate blocks rather than one menu with three lists: the
        monitoring tree carries its own fold state and cannot be expressed as
        `NavigationMenuItem`s while it is expanded.
      -->
      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="dashboardNavigation"
          :collapsed="collapsed"
          orientation="vertical"
          tooltip
          popover
        />

        <div class="shrink-0 h-px bg-border" />

        <AppMonitorNav :collapsed="collapsed" />
      </template>

      <!--
        Authentication stays at the leading edge, while settings and colour
        mode form the preference pair at the trailing edge. All three controls
        are square and stack vertically when the sidebar becomes an icon rail.
      -->
      <template #footer="{ collapsed }">
        <div
          class="flex items-center gap-1"
          :class="collapsed ? 'flex-col' : 'w-full'"
        >
          <AppUserMenu :collapsed="collapsed" />
          <UButton
            to="/settings"
            color="neutral"
            variant="ghost"
            icon="i-lucide-settings"
            square
            :aria-label="$t('nav.settings')"
            :title="$t('nav.settings')"
            :class="collapsed ? '' : 'ms-auto'"
          />
          <AppColorModeButton />
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
