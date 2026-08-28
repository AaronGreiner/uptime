<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { accountUpdateSchema } from '#shared/utils/validation'
import type { z } from 'zod'

definePageMeta({ middleware: 'admin' })

const { t } = useI18n()
const toast = useToast()
const { admin, refreshSession } = useAdmin()
const { accountUpdatesEnabled } = useRuntimeConfig().public

useSeoMeta({ title: () => t('settings.admin') })

const state = reactive({
  username: admin.value?.username ?? '',
  currentPassword: '',
  newPassword: ''
})

const submitting = ref(false)

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
        dashboards: summary.dashboards,
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
  <UDashboardPanel id="settings-admin">
    <template #header>
      <UDashboardNavbar
        :title="$t('nav.settings')"
        icon="i-lucide-settings"
      >
        <template #leading>
          <AppSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <AppSettingsNav />
    </template>

    <!-- Everything here writes to the server, which is what separates it from
         the general page rather than the guard alone. -->
    <template #body>
      <div class="w-full max-w-2xl mx-auto flex flex-col gap-4 sm:gap-6">
        <UCard
          v-if="accountUpdatesEnabled"
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
