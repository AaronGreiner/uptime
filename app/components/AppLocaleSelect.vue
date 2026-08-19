<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  /** `compact` shows the language code only, `full` fills the available width. */
  variant?: 'compact' | 'full'
  collapsed?: boolean
}>(), {
  variant: 'compact',
  collapsed: false
})

const { locale, locales, setLocale } = useI18n()

const currentName = computed(() => locales.value.find(entry => entry.code === locale.value)?.name ?? locale.value)

const items = computed<DropdownMenuItem[]>(() => locales.value.map(entry => ({
  label: entry.name ?? entry.code,
  icon: entry.code === locale.value ? 'i-lucide-check' : undefined,
  onSelect: () => setLocale(entry.code)
})))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: props.variant === 'full' ? 'start' : 'end' }"
    :ui="{ content: 'min-w-40' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      :label="collapsed ? undefined : (variant === 'full' ? currentName : locale.toUpperCase())"
      :block="variant === 'full'"
      :square="collapsed"
      :aria-label="$t('settings.language')"
      :ui="{ base: variant === 'full' ? 'justify-start ring ring-default' : '' }"
    />
  </UDropdownMenu>
</template>
