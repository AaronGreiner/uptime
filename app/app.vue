<script setup lang="ts">
import * as locales from '@nuxt/ui/locale'

const { locale, t } = useI18n()
const appConfig = useRuntimeConfig().public

// Nuxt UI ships its own translations for built-in component labels.
const uiLocale = computed(() => locales[locale.value as keyof typeof locales] ?? locales.en)

useHead({
  htmlAttrs: { lang: locale },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }
  ],
  titleTemplate: title => title ? `${title} · ${appConfig.appName}` : appConfig.appName
})

useSeoMeta({
  description: () => t('app.description'),
  ogTitle: () => appConfig.appName,
  ogDescription: () => t('app.description')
})
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
