<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const route = useRoute()
const { data: dashboards } = useDashboards()
const { refresh: refreshMonitors } = useMonitors()
const { refresh: refreshSummary } = useStatusSummary()

// One polling loop for the whole application: every page reads the same caches.
usePolling(() => {
  refreshMonitors()
  refreshSummary()
}, 10_000)

const navigation = computed<NavigationMenuItem[]>(() => [{
  label: t('nav.dashboards'),
  icon: 'i-lucide-layout-dashboard',
  active: route.path === '/' || route.path.startsWith('/d/'),
  children: dashboards.value.map(dashboard => ({
    label: dashboard.name,
    description: dashboard.description ?? undefined,
    to: `/d/${dashboard.slug}`
  }))
}, {
  label: t('nav.monitors'),
  icon: 'i-lucide-activity',
  to: '/monitors',
  active: route.path.startsWith('/monitors')
}])
</script>

<template>
  <div class="min-h-screen flex flex-col bg-default">
    <UHeader :ui="{ container: 'max-w-(--ui-container) gap-3' }">
      <template #left>
        <NuxtLink
          to="/"
          class="flex items-center gap-2.5 font-semibold text-highlighted"
        >
          <AppLogo class="size-7 shrink-0" />
          <span>{{ $t('app.name') }}</span>
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="navigation"
        variant="link"
      />

      <template #right>
        <AppStatusPill />
        <AppLocaleSelect />
        <UColorModeButton />
        <AppUserMenu />
      </template>

      <template #body>
        <UNavigationMenu
          :items="navigation"
          orientation="vertical"
          class="-mx-2.5"
        />
      </template>
    </UHeader>

    <UMain class="flex-1">
      <slot />
    </UMain>

    <footer class="border-t border-default">
      <UContainer class="py-5 flex flex-wrap items-center justify-between gap-3 text-sm text-dimmed">
        <span>{{ $t('app.name') }} · {{ $t('app.description') }}</span>
        <NuxtLink
          to="/monitors"
          class="hover:text-default transition-colors"
        >
          {{ $t('nav.monitors') }}
        </NuxtLink>
      </UContainer>
    </footer>
  </div>
</template>
