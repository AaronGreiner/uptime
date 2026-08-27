<script setup lang="ts">
import type { DashboardWidget } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import { WIDGET_CONFIG_DEFAULTS } from '#shared/utils/widget'

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
  .slice(0, props.widget.config.limit ?? WIDGET_CONFIG_DEFAULTS.limit))

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
    :title="title"
    :empty="!rows.length"
    :empty-label="$t('widget.certificates.none')"
    empty-icon="i-lucide-shield-off"
  >
    <ul class="flex flex-col">
      <li
        v-for="row in rows"
        :key="row.monitor.id"
        class="flex items-center gap-2 py-1 border-b border-default/50 last:border-0"
      >
        <UIcon
          name="i-lucide-shield"
          class="size-3.5 shrink-0"
          :class="tone(row)"
        />
        <NuxtLink
          :to="`/monitors/${row.monitor.id}`"
          class="flex-1 min-w-0 text-sm text-highlighted hover:text-primary transition-colors truncate-target"
        >
          {{ row.monitor.name }}
        </NuxtLink>
        <span class="hidden @[22rem]:inline text-xs text-dimmed tabular-nums shrink-0">
          {{ formatDate(row.expiresAt) }}
        </span>
        <span
          class="text-xs font-medium tabular-nums shrink-0 w-16 text-right"
          :class="tone(row)"
        >
          {{ row.days < 0 ? $t('monitor.detail.certificateExpired') : $t('widget.certificates.days', { days: row.days }) }}
        </span>
      </li>
    </ul>
  </DashboardWidgetShell>
</template>
