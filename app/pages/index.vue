<script setup lang="ts">
/** The start page always forwards to the dashboard flagged as default. */
const { data: dashboards } = await useDashboards()

const target = computed(() => dashboards.value.find(dashboard => dashboard.isDefault) ?? dashboards.value[0])

if (target.value) {
  await navigateTo(`/d/${target.value.slug}`, { replace: true })
}
</script>

<template>
  <UContainer class="py-16">
    <UEmpty
      icon="i-lucide-layout-dashboard"
      :title="$t('error.dashboardNotFound')"
    />
  </UContainer>
</template>
