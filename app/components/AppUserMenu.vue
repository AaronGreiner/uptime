<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { isAdmin, admin, clearSession } = useAdmin()
const { t } = useI18n()
const toast = useToast()
const router = useRouter()

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clearSession()

  toast.add({ title: t('auth.signedOut'), color: 'neutral', icon: 'i-lucide-log-out' })
  await router.push('/')
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    label: admin.value?.username ?? '',
    type: 'label' as const,
    icon: 'i-lucide-shield-check'
  }],
  [{
    label: t('nav.settings'),
    icon: 'i-lucide-settings',
    to: '/settings'
  }, {
    label: t('auth.signOut'),
    icon: 'i-lucide-log-out',
    onSelect: signOut
  }]
])
</script>

<template>
  <UDropdownMenu
    v-if="isAdmin"
    :items="items"
    :content="{ align: 'end' }"
  >
    <UButton
      icon="i-lucide-shield-check"
      color="neutral"
      variant="ghost"
      :aria-label="$t('nav.settings')"
    />
  </UDropdownMenu>

  <UButton
    v-else
    to="/login"
    icon="i-lucide-log-in"
    color="neutral"
    variant="ghost"
    :label="$t('auth.signIn')"
    :ui="{ label: 'hidden sm:inline' }"
  />
</template>
