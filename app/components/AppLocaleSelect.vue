<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()

const items = computed(() => locales.value.map(entry => ({
  label: entry.name ?? entry.code,
  value: entry.code
})))

const current = computed({
  get: () => locale.value,
  set: (value: string) => setLocale(value as typeof locale.value)
})
</script>

<template>
  <USelectMenu
    v-model="current"
    :items="items"
    value-key="value"
    :search-input="false"
    variant="ghost"
    color="neutral"
    icon="i-lucide-languages"
    :ui="{ base: 'w-auto min-w-0 gap-1.5', content: 'w-auto min-w-36', trailingIcon: 'hidden sm:inline-flex' }"
    :aria-label="$t('settings.language')"
  >
    <template #default="{ modelValue }">
      <span class="hidden sm:inline">{{ items.find(item => item.value === modelValue)?.label }}</span>
      <span class="sm:hidden uppercase">{{ modelValue }}</span>
    </template>
  </USelectMenu>
</template>
