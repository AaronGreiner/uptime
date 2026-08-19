<script setup lang="ts">
import type { Heartbeat, MonitorStatsPoint, MonitorUptime } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { STATS_RANGES } from '#shared/utils/stats'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isAdmin } = useAdmin()
const { formatDateTime, formatDuration, formatLatency, formatRelativeTime, formatUptime, formatDate } = useFormatters()

const monitorId = computed(() => Number(route.params.id))

const { data: monitor, error, refresh } = await useMonitor(monitorId)

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: t('error.monitorNotFound'), fatal: true })
}

useSeoMeta({ title: () => monitor.value?.name ?? t('monitor.title') })

const range = ref<StatsRange>('24h')

const { data: stats, refresh: refreshStats } = await useAsyncData(
  () => `monitor-stats-${monitorId.value}-${range.value}`,
  () => $fetch<{ points: MonitorStatsPoint[], uptime: MonitorUptime }>(`/api/monitors/${monitorId.value}/stats`, {
    query: { range: range.value }
  }),
  { watch: [range, monitorId] }
)

const { data: heartbeats, refresh: refreshHeartbeats } = await useAsyncData(
  () => `monitor-heartbeats-${monitorId.value}`,
  () => $fetch<Heartbeat[]>(`/api/monitors/${monitorId.value}/heartbeats`, { query: { limit: 50 } }),
  { watch: [monitorId], default: () => [] }
)

async function reload() {
  await Promise.all([refresh(), refreshStats(), refreshHeartbeats()])
}

usePolling(reload, 15_000)

const { pending, checkNow, toggleActive, remove } = useMonitorActions(reload)

const formOpen = ref(false)
const deleteOpen = ref(false)

async function confirmDelete() {
  if (monitor.value && await remove(monitor.value)) {
    await router.push('/monitors')
  }
}

const target = computed(() => monitor.value ? monitorTarget(monitor.value) : '')

/** Days left on the TLS certificate, negative once it has expired. */
const certificateDays = computed(() => {
  const expiresAt = monitor.value?.state.certificateExpiresAt

  return expiresAt ? Math.floor((expiresAt - Date.now() / 1000) / 86_400) : null
})

const certificateTone = computed(() => {
  if (certificateDays.value === null) {
    return 'text-dimmed'
  }

  if (certificateDays.value < 0) {
    return 'text-error'
  }

  return certificateDays.value <= (monitor.value?.certificateExpiryWarningDays ?? 14) ? 'text-warning' : 'text-success'
})

const rangeItems = computed(() => STATS_RANGES.map(value => ({ label: t(`range.${value}`), value })))

const recentChecks = computed(() => [...(heartbeats.value ?? [])].reverse())
</script>

<template>
  <UContainer
    v-if="monitor"
    class="py-6 sm:py-8 space-y-6"
  >
    <UButton
      to="/monitors"
      icon="i-lucide-arrow-left"
      variant="link"
      color="neutral"
      size="sm"
      class="-ml-2"
      :label="$t('monitor.title')"
    />

    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 space-y-2">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-semibold text-highlighted truncate-target">
            {{ monitor.name }}
          </h1>
          <MonitorStatusBadge
            :status="monitor.state.status"
            size="md"
          />
        </div>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <ULink
            v-if="monitor.type === 'http'"
            :to="monitor.url"
            target="_blank"
            class="inline-flex items-center gap-1 hover:text-primary"
          >
            {{ target }}
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </ULink>
          <span
            v-else
            class="font-mono"
          >{{ target }}</span>

          <span class="text-dimmed">·</span>
          <span>{{ $t(`monitor.type.${monitor.type}`) }}</span>
          <span class="text-dimmed">·</span>
          <span>{{ $t('monitor.detail.interval', { seconds: formatDuration(monitor.intervalSeconds) }) }}</span>
        </div>

        <p
          v-if="monitor.description"
          class="text-sm text-muted"
        >
          {{ monitor.description }}
        </p>
      </div>

      <div
        v-if="isAdmin"
        class="flex items-center gap-2"
      >
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="subtle"
          :loading="pending === monitor.id"
          :label="$t('monitor.actions.checkNow')"
          @click="checkNow(monitor)"
        />
        <UButton
          :icon="monitor.active ? 'i-lucide-pause' : 'i-lucide-play'"
          color="neutral"
          variant="subtle"
          :aria-label="$t(monitor.active ? 'monitor.actions.pause' : 'monitor.actions.resume')"
          @click="toggleActive(monitor)"
        />
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="subtle"
          :aria-label="$t('common.edit')"
          @click="formOpen = true"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="subtle"
          :aria-label="$t('common.delete')"
          @click="deleteOpen = true"
        />
      </div>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UCard variant="outline">
        <p class="text-xs uppercase tracking-wide text-dimmed">
          {{ $t('monitor.detail.uptime') }} · {{ $t(`range.${range}`) }}
        </p>
        <p class="text-2xl font-semibold tabular-nums mt-1">
          {{ formatUptime(stats?.uptime.ratio ?? null) }}
        </p>
      </UCard>

      <UCard variant="outline">
        <p class="text-xs uppercase tracking-wide text-dimmed">
          {{ $t('monitor.detail.avgResponseTime') }}
        </p>
        <p class="text-2xl font-semibold tabular-nums mt-1">
          {{ formatLatency(stats?.uptime.avgLatencyMs ?? null) }}
        </p>
      </UCard>

      <UCard variant="outline">
        <p class="text-xs uppercase tracking-wide text-dimmed">
          {{ $t('monitor.detail.lastCheck') }}
        </p>
        <p class="text-2xl font-semibold mt-1">
          {{ formatRelativeTime(monitor.state.lastCheckedAt) }}
        </p>
        <p class="text-xs text-dimmed mt-1 truncate-target">
          {{ monitor.state.message ?? '—' }}
        </p>
      </UCard>

      <UCard variant="outline">
        <p class="text-xs uppercase tracking-wide text-dimmed">
          {{ $t('monitor.detail.certificate') }}
        </p>
        <p
          class="text-2xl font-semibold mt-1"
          :class="certificateTone"
        >
          <template v-if="certificateDays === null">
            —
          </template>
          <template v-else-if="certificateDays < 0">
            {{ $t('monitor.detail.certificateExpired') }}
          </template>
          <template v-else>
            {{ certificateDays }} d
          </template>
        </p>
        <p
          v-if="monitor.state.certificateExpiresAt"
          class="text-xs text-dimmed mt-1"
        >
          {{ $t('monitor.detail.certificateValidUntil', { date: formatDate(monitor.state.certificateExpiresAt) }) }}
        </p>
      </UCard>
    </div>

    <UCard variant="outline">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="font-medium text-highlighted">
          {{ $t('monitor.detail.responseTime') }}
        </h2>
        <USelectMenu
          v-model="range"
          :items="rangeItems"
          value-key="value"
          :search-input="false"
          size="sm"
          class="w-36"
        />
      </div>

      <MonitorLatencyChart
        :points="stats?.points ?? []"
        :height="220"
      />
    </UCard>

    <UCard variant="outline">
      <h2 class="font-medium text-highlighted mb-4">
        {{ $t('monitor.detail.history') }}
      </h2>

      <MonitorHeartbeatBar
        :heartbeats="heartbeats"
        :count="50"
      />

      <div
        v-if="recentChecks.length"
        class="mt-6 overflow-x-auto"
      >
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide text-dimmed border-b border-default">
              <th class="py-2 pr-4 font-medium">
                {{ $t('monitor.detail.checkedAt') }}
              </th>
              <th class="py-2 pr-4 font-medium">
                {{ $t('status.up') }}
              </th>
              <th class="py-2 pr-4 font-medium text-right">
                {{ $t('monitor.detail.responseTime') }}
              </th>
              <th class="py-2 pr-4 font-medium text-right">
                {{ $t('monitor.detail.statusCode') }}
              </th>
              <th class="py-2 font-medium">
                {{ $t('monitor.detail.message') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="heartbeat in recentChecks"
              :key="heartbeat.id"
              class="border-b border-default/60 last:border-0"
            >
              <td class="py-2 pr-4 whitespace-nowrap text-muted">
                {{ formatDateTime(heartbeat.checkedAt) }}
              </td>
              <td class="py-2 pr-4">
                <MonitorStatusBadge
                  :status="heartbeat.status"
                  size="sm"
                />
              </td>
              <td class="py-2 pr-4 text-right tabular-nums">
                {{ formatLatency(heartbeat.latencyMs) }}
              </td>
              <td class="py-2 pr-4 text-right tabular-nums text-muted">
                {{ heartbeat.statusCode ?? '—' }}
              </td>
              <td class="py-2 text-muted">
                {{ heartbeat.message ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p
        v-else
        class="mt-6 text-sm text-dimmed"
      >
        {{ $t('monitor.detail.noHistory') }}
      </p>
    </UCard>

    <template v-if="isAdmin">
      <MonitorFormModal
        v-model:open="formOpen"
        :monitor="monitor"
        @saved="reload()"
      />

      <ConfirmModal
        v-model:open="deleteOpen"
        :title="$t('monitor.delete.title')"
        :description="$t('monitor.delete.description', { name: monitor.name })"
        :loading="pending !== null"
        @confirm="confirmDelete"
      />
    </template>
  </UContainer>
</template>
