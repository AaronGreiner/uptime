<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { accountUpdateSchema } from '#shared/utils/validation'
import type { z } from 'zod'

definePageMeta({ middleware: 'admin' })

const { t } = useI18n()
const toast = useToast()
const colorMode = useColorMode()
const { admin, refreshSession } = useAdmin()

useSeoMeta({ title: () => t('settings.title') })

const state = reactive({
  username: admin.value?.username ?? '',
  currentPassword: '',
  newPassword: ''
})

const submitting = ref(false)

type ThemePreference = 'system' | 'light' | 'dark'

const themeItems = computed(() => (['system', 'light', 'dark'] as const).map(value => ({
  label: t(`settings.themeOption.${value}`),
  value
})))

const theme = computed<ThemePreference>({
  get: () => colorMode.preference as ThemePreference,
  set: (value) => {
    colorMode.preference = value
  }
})

async function onSubmit(event: FormSubmitEvent<z.output<typeof accountUpdateSchema>>) {
  submitting.value = true

  try {
    await $fetch('/api/account', { method: 'PATCH', body: event.data })
    await refreshSession()

    state.currentPassword = ''
    state.newPassword = ''

    toast.add({ title: t('settings.updated'), color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar
        :title="$t('settings.title')"
        icon="i-lucide-settings"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full max-w-2xl flex flex-col gap-4 sm:gap-6">
        <UCard
          :title="$t('settings.account')"
          :description="$t('settings.accountDescription')"
        >
          <UForm
            :schema="accountUpdateSchema"
            :state="state"
            class="space-y-4"
            @submit="onSubmit"
          >
            <UFormField
              :label="$t('auth.username')"
              name="username"
              required
            >
              <UInput
                v-model="state.username"
                class="w-full"
                autocomplete="username"
              />
            </UFormField>

            <UFormField
              :label="$t('settings.currentPassword')"
              name="currentPassword"
              required
            >
              <UInput
                v-model="state.currentPassword"
                class="w-full"
                type="password"
                autocomplete="current-password"
              />
            </UFormField>

            <UFormField
              :label="$t('settings.newPassword')"
              name="newPassword"
              :description="$t('settings.newPasswordHint')"
            >
              <UInput
                v-model="state.newPassword"
                class="w-full"
                type="password"
                autocomplete="new-password"
              />
            </UFormField>

            <UButton
              type="submit"
              :loading="submitting"
              :label="$t('common.save')"
            />
          </UForm>
        </UCard>

        <UCard
          :title="$t('settings.appearance')"
          :description="$t('settings.appearanceDescription')"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="$t('settings.theme')">
              <ClientOnly>
                <USelectMenu
                  v-model="theme"
                  :items="themeItems"
                  value-key="value"
                  :search-input="false"
                  class="w-full"
                />
                <template #fallback>
                  <USkeleton class="h-8 w-full" />
                </template>
              </ClientOnly>
            </UFormField>

            <UFormField :label="$t('settings.language')">
              <AppLocaleSelect variant="full" />
            </UFormField>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
