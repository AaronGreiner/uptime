<script setup lang="ts">
import type { NuxtError } from '#app'
import * as locales from '@nuxt/ui/locale'

const props = defineProps<{ error: NuxtError }>()

const { locale, t } = useI18n()

const uiLocale = computed(() => locales[locale.value as keyof typeof locales] ?? locales.en)

const title = computed(() => props.error.statusCode === 404 ? t('error.notFound') : t('common.error'))
const description = computed(() => props.error.statusMessage
  || (props.error.statusCode === 404 ? t('error.notFoundDescription') : ''))
</script>

<template>
  <UApp :locale="uiLocale">
    <div class="min-h-screen grid place-items-center bg-default p-6">
      <div class="text-center space-y-4 max-w-md">
        <AppLogo class="size-10 mx-auto" />
        <p class="text-6xl font-semibold text-highlighted tabular-nums">
          {{ error.statusCode }}
        </p>
        <h1 class="text-xl font-medium text-highlighted">
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="text-muted"
        >
          {{ description }}
        </p>
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          :label="$t('error.backHome')"
          @click="clearError({ redirect: '/' })"
        />
      </div>
    </div>
  </UApp>
</template>
