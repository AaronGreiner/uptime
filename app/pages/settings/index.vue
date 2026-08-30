<script setup lang="ts">
import { MONITOR_PATH_FORMATS } from '#shared/utils/group'
import { LATENCY_SPREADS } from '#shared/utils/monitor'

const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()
const { morphMotion } = useMorphMotion()
const monitorPathFormat = useMonitorPathFormat()
const latencySpread = useLatencySpread()

useSeoMeta({ title: () => t('settings.general') })

type ThemePreference = 'system' | 'light' | 'dark'

const themeItems = computed(() => (['system', 'light', 'dark'] as const).map(value => ({
  label: t(`settings.themeOption.${value}`),
  value
})))

const morphMotionItems = computed(() => (['system', 'on', 'off'] as const).map(value => ({
  label: t(`settings.iconMotionOption.${value}`),
  value
})))

const monitorPathItems = computed(() => MONITOR_PATH_FORMATS.map(value => ({
  label: t(`settings.monitorPathOption.${value}`),
  value
})))

const latencySpreadItems = computed(() => LATENCY_SPREADS.map(value => ({
  label: t(`monitor.latencySpread.${value}`),
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
</script>

<template>
  <UDashboardPanel id="settings">
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

    <!--
      Nothing here is stored on the server, so the page stays open to every
      reader; the administrative settings live next door behind the guard.
    -->
    <template #body>
      <div class="w-full max-w-2xl mx-auto flex flex-col gap-4 sm:gap-6">
        <UCard
          :title="$t('settings.appearance')"
          :description="$t('settings.appearanceDescription')"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="$t('settings.theme')">
              <USelectMenu
                v-model="theme"
                :items="themeItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
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

            <!-- Below the control rather than above it, so the four selects
                 stay on one line with each other. -->
            <UFormField
              :label="$t('settings.monitorPath')"
              :help="$t('settings.monitorPathHint')"
            >
              <USelectMenu
                v-model="monitorPathFormat"
                :items="monitorPathItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="$t('settings.latencySeries')"
              :help="$t('settings.latencySeriesHint')"
            >
              <MonitorLatencySeriesToggle
                block
                size="md"
              />
            </UFormField>

            <UFormField
              :label="$t('settings.latencySpread')"
              :help="$t('settings.latencySpreadHint')"
            >
              <USelectMenu
                v-model="latencySpread"
                :items="latencySpreadItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
