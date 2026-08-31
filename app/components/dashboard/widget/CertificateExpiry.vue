<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const { t } = useI18n()
const { formatDate } = useFormatters()
const now = useNow()
const { scoped } = useWidgetScope(() => props.widget)

interface CertificateRow {
  monitor: MonitorWithState
  /** Whole days left, negative once the certificate has expired. */
  days: number
  expiresAt: number
}

/**
 * Soonest expiry first. A monitor without a reading has nothing to warn about —
 * either it is not an HTTPS check, or no handshake has succeeded yet.
 */
const rows = computed<CertificateRow[]>(() => scoped.value
  .flatMap((monitor) => {
    const expiresAt = monitor.state.certificateExpiresAt

    return expiresAt
      ? [{ monitor, expiresAt, days: Math.floor((expiresAt - now.value / 1000) / 86_400) }]
      : []
  })
  .sort((a, b) => a.expiresAt - b.expiresAt)
)

/** Each monitor carries its own warning window, so the tone follows that one. */
function tone(row: CertificateRow): string {
  if (row.days < 0) {
    return 'text-error'
  }

  return row.days <= row.monitor.certificateExpiryWarningDays ? 'text-warning' : 'text-success'
}

const title = computed(() => props.widget.config.title || t('widget.type.certificate-expiry'))
</script>

<template>
  <DashboardWidgetShell
    list
    :title="title"
    :dense="widget.height === 'compact'"
    :empty="!rows.length"
    :empty-label="$t('widget.certificates.none')"
    empty-icon="i-lucide-shield-off"
  >
    <DashboardWidgetList
      :items="rows"
      :item-key="row => row.monitor.id"
      :height="widget.height"
      class="auto-rows-[45px] @[14rem]:auto-rows-[29px]"
    >
      <template #default="{ item: row }">
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 @[14rem]:flex">
          <UIcon
            name="i-lucide-shield"
            class="size-3.5 shrink-0"
            :class="tone(row)"
          />
          <NuxtLink
            :to="`/monitors/${row.monitor.id}`"
            class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors"
          >
            <MonitorPathLabel :monitor="row.monitor" />
          </NuxtLink>
          <span class="hidden @[22rem]:inline text-xs text-dimmed tabular-nums shrink-0">
            {{ formatDate(row.expiresAt) }}
          </span>
          <span
            class="col-start-2 text-xs font-medium tabular-nums shrink-0 @[14rem]:w-16 @[14rem]:text-right"
            :class="tone(row)"
          >
            {{ row.days < 0 ? $t('monitor.detail.certificateExpired') : $t('widget.certificates.days', { days: row.days }) }}
          </span>
        </div>
      </template>
    </DashboardWidgetList>
  </DashboardWidgetShell>
</template>
