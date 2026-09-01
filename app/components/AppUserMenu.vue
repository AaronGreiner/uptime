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

/**
 * Authentication keeps one fixed, icon-only place in the footer. Its menu
 * spells out the current action and, while signed in, who will be signed out.
 */
const items = computed<DropdownMenuItem[][]>(() => [
  ...(isAdmin.value
    ? [[{ label: admin.value?.username ?? '', type: 'label' as const, icon: 'i-lucide-shield-check' }]]
    : []),
  [isAdmin.value
    ? { label: t('auth.signOut'), icon: 'i-lucide-log-out', onSelect: signOut }
    : { label: t('auth.signIn'), icon: 'i-lucide-log-in', to: '/login' }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', side: props.collapsed ? 'right' : 'top' }"
    :ui="{ content: 'min-w-40' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      square
      :aria-label="$t(isAdmin ? 'auth.signOut' : 'auth.signIn')"
    >
      <template #leading>
        <AppMorphIcon
          :name="isAdmin ? 'logOut' : 'logIn'"
          class="size-5"
        />
      </template>
    </UButton>
  </UDropdownMenu>
</template>
