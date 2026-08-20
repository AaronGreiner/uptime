<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { accountUpdateSchema } from '#shared/utils/validation'
import type { z } from 'zod'

definePageMeta({ middleware: 'admin' })

const { t, locale, locales, setLocale } = useI18n()
const toast = useToast()
const colorMode = useColorMode()
const { admin, refreshSession } = useAdmin()
const { morphMotion } = useMorphMotion()

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

const morphMotionItems = computed(() => (['system', 'on', 'off'] as const).map(value => ({
  label: t(`settings.iconMotionOption.${value}`),
  value
})))

const theme = computed<ThemePreference>({
  get: () => colorMode.preference as ThemePreference,
  set: (value) => {
    colorMode.preference = value
  }
})

const localeItems = computed(() => locales.value.map(entry => ({
  label: entry.name ?? entry.code,
  value: entry.code
})))

const language = computed({
  get: () => locale.value,
  set: (value) => {
    void setLocale(value)
  }
})

const clearOpen = ref(false)
const seedOpen = ref(false)
const clearing = ref(false)
const seeding = ref(false)

/**
 * Both actions replace what every page is showing, so the shared caches are
 * refetched before the toast appears.
 */
async function onClearData() {
  clearing.value = true

  try {
    await $fetch('/api/admin/data', { method: 'DELETE' })
    await refreshNuxtData()

    clearOpen.value = false
    toast.add({ title: t('settings.data.clear.done'), color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    clearing.value = false
  }
}

async function onSeedDemoData() {
  seeding.value = true

  try {
    const summary = await $fetch('/api/admin/demo-data', { method: 'POST' })
    await refreshNuxtData()

    seedOpen.value = false
    toast.add({
      title: t('settings.data.demo.done', {
        monitors: summary.monitors,
        groups: summary.groups,
        days: summary.historyDays
      }),
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    seeding.value = false
  }
}

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
          <AppSidebarCollapse />
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
              <AppPasswordInput
                v-model="state.currentPassword"
                class="w-full"
                autocomplete="current-password"
              />
            </UFormField>

            <UFormField
              :label="$t('settings.newPassword')"
              name="newPassword"
              :description="$t('settings.newPasswordHint')"
            >
              <AppPasswordInput
                v-model="state.newPassword"
                class="w-full"
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
          <div class="grid gap-4 sm:grid-cols-3">
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
              <USelectMenu
                v-model="language"
                :items="localeItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField :label="$t('settings.iconMotion')">
              <USelectMenu
                v-model="morphMotion"
                :items="morphMotionItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>
          </div>
        </UCard>

        <UCard
          :title="$t('settings.data.title')"
          :description="$t('settings.data.description')"
        >
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div class="min-w-0 sm:flex-1">
                <p class="font-medium text-highlighted">
                  {{ $t('settings.data.demo.label') }}
                </p>
                <p class="text-sm text-muted">
                  {{ $t('settings.data.demo.hint') }}
                </p>
              </div>

              <UButton
                color="neutral"
                variant="subtle"
                icon="i-lucide-database-zap"
                class="self-start shrink-0"
                :label="$t('settings.data.demo.action')"
                :loading="seeding"
                :disabled="clearing"
                @click="seedOpen = true"
              />
            </div>

            <USeparator />

            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div class="min-w-0 sm:flex-1">
                <p class="font-medium text-highlighted">
                  {{ $t('settings.data.clear.label') }}
                </p>
                <p class="text-sm text-muted">
                  {{ $t('settings.data.clear.hint') }}
                </p>
              </div>

              <UButton
                color="error"
                variant="subtle"
                icon="i-lucide-trash-2"
                class="self-start shrink-0"
                :label="$t('settings.data.clear.action')"
                :loading="clearing"
                :disabled="seeding"
                @click="clearOpen = true"
              />
            </div>
          </div>
        </UCard>

        <ConfirmModal
          v-model:open="seedOpen"
          :title="$t('settings.data.demo.title')"
          :description="$t('settings.data.demo.description')"
          :confirm-label="$t('settings.data.demo.action')"
          :loading="seeding"
          @confirm="onSeedDemoData"
        />

        <ConfirmModal
          v-model:open="clearOpen"
          :title="$t('settings.data.clear.title')"
          :description="$t('settings.data.clear.description')"
          :confirm-label="$t('settings.data.clear.action')"
          :loading="clearing"
          @confirm="onClearData"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
