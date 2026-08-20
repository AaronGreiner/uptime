<script setup lang="ts">
/** The start page always forwards to the dashboard flagged as default. */
const { data: dashboards } = await useDashboards()

const target = computed(() => dashboards.value.find(dashboard => dashboard.isDefault) ?? dashboards.value[0])

if (target.value) {
  await navigateTo(`/d/${target.value.slug}`, { replace: true })
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar
        :title="$t('nav.dashboards')"
        icon="i-lucide-layout-dashboard"
      >
        <template #leading>
          <AppSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        icon="i-lucide-layout-dashboard"
        :title="$t('error.dashboardNotFound')"
        class="flex-1"
      />
    </template>
  </UDashboardPanel>
</template>
