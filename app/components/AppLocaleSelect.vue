<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

const { locale, locales, setLocale } = useI18n()

const items = computed<DropdownMenuItem[]>(() => locales.value.map(entry => ({
  label: entry.name ?? entry.code,
  icon: entry.code === locale.value ? 'i-lucide-check' : undefined,
  onSelect: () => setLocale(entry.code)
})))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'min-w-40' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      :label="collapsed ? undefined : locale.toUpperCase()"
      :square="collapsed"
      :aria-label="$t('settings.language')"
    />
  </UDropdownMenu>
</template>
