<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{ collapsed?: boolean }>()

const { isAdmin, admin, clearSession } = useAdmin()
const { t, locale, locales, setLocale } = useI18n()
const toast = useToast()
const router = useRouter()

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clearSession()

  toast.add({ title: t('auth.signedOut'), color: 'neutral', icon: 'i-lucide-log-out' })
  await router.push('/')
}

/**
 * The footer's one menu: who you are, and what belongs to you rather than to
 * the instance. The settings page and the language sit here rather than as
 * buttons of their own, so the footer stays legible at the narrowest sidebar
 * width; only the colour mode keeps a button, because it is the one of the
 * three that is flipped rather than chosen.
 */
const items = computed<DropdownMenuItem[][]>(() => [
  ...(isAdmin.value
    ? [[{ label: admin.value?.username ?? '', type: 'label' as const, icon: 'i-lucide-shield-check' }]]
    : []),
  [{
    label: t('nav.settings'),
    icon: 'i-lucide-settings',
    to: '/settings'
  }, {
    label: t('settings.language'),
    icon: 'i-lucide-languages',
    children: locales.value.map(entry => ({
      label: entry.name ?? entry.code,
      icon: entry.code === locale.value ? 'i-lucide-check' : undefined,
      onSelect: () => setLocale(entry.code)
    }))
  }],
  [isAdmin.value
    ? { label: t('auth.signOut'), icon: 'i-lucide-log-out', onSelect: signOut }
    : { label: t('auth.signInTitle'), icon: 'i-lucide-log-in', to: '/login' }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', side: props.collapsed ? 'right' : 'top' }"
    :ui="{ content: 'min-w-48' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      :icon="isAdmin ? 'i-lucide-shield-check' : 'i-lucide-log-in'"
      :label="collapsed ? undefined : (isAdmin ? admin?.username : $t('auth.signIn'))"
      :block="!collapsed"
      :square="collapsed"
      :aria-label="$t(isAdmin ? 'auth.adminOnly' : 'auth.signIn')"
      :ui="{ base: collapsed ? '' : 'justify-start' }"
    />
  </UDropdownMenu>
</template>
