<script setup lang="ts">
import type { MaintenanceWindow } from '#shared/types/maintenance'

definePageMeta({ middleware: 'admin' })

const { t } = useI18n()
const toast = useToast()

useSeoMeta({ title: () => t('maintenance.label') })

const { data: windows, refresh } = await useMaintenanceWindows()
const { timeZone, refresh: refreshSettings } = await useMaintenanceSettings()

const formOpen = ref(false)
const editedWindow = ref<MaintenanceWindow | null>(null)

const selectedTimeZone = ref(timeZone.value)
const savingTimeZone = ref(false)

watch(timeZone, (value) => {
  selectedTimeZone.value = value
})

/**
 * Every zone the runtime knows, so the field is a picker rather than a string
 * somebody has to spell correctly. `supportedValuesOf` is absent on nothing
 * current, but a runtime without it should offer the stored value rather than
 * an empty list.
 */
const timeZoneItems = computed(() => {
  const zones = Intl.supportedValuesOf?.('timeZone') ?? [timeZone.value]

  return zones.includes(timeZone.value) ? zones : [timeZone.value, ...zones]
})

function openForm(window: MaintenanceWindow | null) {
  editedWindow.value = window
  formOpen.value = true
}

/**
 * A window changes what every monitor under it reports, and the server resolves
 * that into the list payload, so the shared caches are refetched alongside it.
 */
async function reload() {
  await Promise.all([refresh(), refreshNuxtData('monitors'), refreshNuxtData('monitor-groups')])
}

async function onSaveTimeZone() {
  savingTimeZone.value = true

  try {
    await $fetch('/api/maintenance/settings', {
      method: 'PATCH',
      body: { timeZone: selectedTimeZone.value }
    })

    await refreshSettings()
    await reload()

    toast.add({ title: t('settings.updated'), color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    savingTimeZone.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="settings-maintenance">
    <template #header>
      <UDashboardNavbar
        :title="$t('nav.settings')"
        icon="i-lucide-settings"
      >
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-plus"
            :label="$t('maintenance.addWindow')"
            @click="openForm(null)"
          />
        </template>
      </UDashboardNavbar>

      <AppSettingsNav />
    </template>

    <template #body>
      <div class="w-full max-w-2xl mx-auto flex flex-col gap-4 sm:gap-6">
        <UCard
          :title="$t('maintenance.windows')"
          :description="$t('maintenance.description')"
        >
          <MaintenanceWindowList
            :windows="windows"
            @edit="openForm($event)"
            @deleted="reload"
          />
        </UCard>

        <UCard
          :title="$t('maintenance.timeZone')"
          :description="$t('maintenance.timeZoneDescription')"
        >
          <div class="flex flex-wrap items-center gap-2">
            <USelectMenu
              v-model="selectedTimeZone"
              :items="timeZoneItems"
              class="w-full sm:w-80"
            />
            <UButton
              color="neutral"
              variant="subtle"
              :label="$t('common.save')"
              :loading="savingTimeZone"
              :disabled="selectedTimeZone === timeZone"
              @click="onSaveTimeZone"
            />
          </div>
        </UCard>

        <MaintenanceWindowFormModal
          v-model:open="formOpen"
          :window="editedWindow"
          @saved="reload"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
