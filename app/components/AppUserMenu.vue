<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ collapsed?: boolean }>()

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
  [{ label: admin.value?.username ?? '', type: 'label' as const, icon: 'i-lucide-shield-check' }],
  [{ label: t('nav.settings'), icon: 'i-lucide-settings', to: '/settings' }],
  [{ label: t('auth.signOut'), icon: 'i-lucide-log-out', onSelect: signOut }]
])
</script>

<template>
  <UDropdownMenu
    v-if="isAdmin"
    :items="items"
    :content="{ align: 'start', side: props.collapsed ? 'right' : 'top' }"
    :ui="{ content: 'min-w-48' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-shield-check"
      :label="collapsed ? undefined : admin?.username"
      :block="!collapsed"
      :square="collapsed"
      :aria-label="$t('auth.adminOnly')"
      :ui="{ base: collapsed ? '' : 'justify-start' }"
    />
  </UDropdownMenu>

  <UButton
    v-else
    to="/login"
    color="neutral"
    variant="ghost"
    icon="i-lucide-log-in"
    :label="collapsed ? undefined : $t('auth.signIn')"
    :block="!collapsed"
    :square="collapsed"
    :aria-label="$t('auth.signIn')"
    :ui="{ base: collapsed ? '' : 'justify-start' }"
  />
</template>
