<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { isAdmin } = useAdmin()

/**
 * The settings sections. Only the general one is open to every reader, so the
 * other two are left out rather than shown leading to a sign-in page.
 */
const items = computed<NavigationMenuItem[]>(() => [
  { label: t('settings.general'), icon: 'i-lucide-sliders-horizontal', to: '/settings' },
  ...(isAdmin.value
    ? [
        { label: t('settings.admin'), icon: 'i-lucide-shield-check', to: '/settings/admin' },
        { label: t('notification.title'), icon: 'i-lucide-bell', to: '/settings/notifications' }
      ]
    : [])
])
</script>

<template>
  <!--
    Left to scroll rather than given the toolbar's truncation treatment: three
    German section names do not fit a phone, and a tab bar that can be swiped
    reads better than three labels cut off mid-word.
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
