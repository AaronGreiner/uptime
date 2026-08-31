<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { isAdmin } = useAdmin()

/**
 * The settings sections. Only the general one is open to every reader, so the
 * administrative ones are left out rather than shown leading to a sign-in page.
 */
const items = computed<NavigationMenuItem[]>(() => [
  { label: t('settings.general'), icon: 'i-lucide-sliders-horizontal', to: '/settings' },
  ...(isAdmin.value
    ? [
        { label: t('settings.admin'), icon: 'i-lucide-shield-check', to: '/settings/admin' },
        { label: t('notification.title'), icon: 'i-lucide-bell', to: '/settings/notifications' },
        { label: t('maintenance.label'), icon: 'i-lucide-wrench', to: '/settings/maintenance' }
      ]
    : [])
])
</script>

<template>
  <!--
    Left to scroll rather than given the toolbar's truncation treatment: four
    German section names do not fit a phone, and a tab bar that can be swiped
    reads better than four labels cut off mid-word.
  -->
  <UDashboardToolbar>
    <template #left>
      <UNavigationMenu
        :items="items"
        highlight
        class="-mx-1"
      />
    </template>
  </UDashboardToolbar>
</template>
