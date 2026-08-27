<script setup lang="ts">
import type { Heartbeat, MonitorStatsPoint, MonitorUptime } from '#shared/types/monitor'
import type { StatsRange } from '#shared/types/stats'
import { MONITOR_RECENT_CHECK_LIMIT, MONITOR_RECENT_TABLE_ROWS, appendHeartbeat } from '#shared/utils/monitor'
import { STATS_RANGES, isStatsRange } from '#shared/utils/stats'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const { isAdmin } = useAdmin()
const { formatDateTime, formatDuration, formatLatency, formatRelativeTime, formatUptime, formatDate } = useFormatters()

const monitorId = computed(() => Number(route.params.id))

const { data: monitor, error, refresh } = await useMonitor(monitorId)

// See the dashboard page: a failed request is not proof that the monitor is
// gone, only a 404 is.
if (error.value) {
  const missing = error.value.statusCode === 404

  throw createError({
    statusCode: missing ? 404 : (error.value.statusCode || 503),
    statusMessage: t(missing ? 'error.monitorNotFound' : 'error.monitorUnavailable'),
    fatal: true
  })
}

useSeoMeta({ title: () => monitor.value?.name ?? t('monitor.title') })

// The chosen range carries over to the next monitor and survives a reload.
const range = useUiPreference<StatsRange>('stats-range', () => '24h', isStatsRange)

const { data: stats, refresh: refreshStats } = await useAsyncData(
  () => `monitor-stats-${monitorId.value}-${range.value}`,
  () => $fetch<{ points: MonitorStatsPoint[], uptime: MonitorUptime }>(`/api/monitors/${monitorId.value}/stats`, {
    query: { range: range.value }
  }),
  { watch: [range, monitorId] }
)

const { data: heartbeats, refresh: refreshHeartbeats } = await useAsyncData(
  () => `monitor-heartbeats-${monitorId.value}`,
  () => $fetch<Heartbeat[]>(`/api/monitors/${monitorId.value}/heartbeats`, { query: { limit: MONITOR_RECENT_CHECK_LIMIT } }),
  { watch: [monitorId], default: () => [] }
)

/** Only needed after an edit; check results arrive over the event stream. */
async function reload() {
  await Promise.all([refresh(), refreshStats(), refreshHeartbeats()])
}

// The state and the heartbeat travel with the event, the chart buckets have to
// be recomputed server side, so that is the only thing refetched here.
onMonitorChecked((event) => {
  if (monitor.value) {
    monitor.value = applyCheckResult(monitor.value, event)
  }

  heartbeats.value = appendHeartbeat(heartbeats.value, event.heartbeat, MONITOR_RECENT_CHECK_LIMIT)

  void refreshStats()
}, monitorId)

const { pending, succeededId, checkNow, toggleActive, remove } = useMonitorActions(reload)

const formOpen = ref(false)
const deleteOpen = ref(false)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

onScopeDispose(() => clearTimeout(copiedTimer))

async function copyTarget() {
  try {
    await navigator.clipboard.writeText(target.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch (copyError) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(copyError), color: 'error' })
  }
}

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
    return 'text-highlighted'
  }

  if (certificateDays.value < 0) {
    return 'text-error'
  }

  return certificateDays.value <= (monitor.value?.certificateExpiryWarningDays ?? 14) ? 'text-warning' : 'text-success'
})

const rangeItems = computed(() => STATS_RANGES.map(value => ({ label: t(`range.${value}`), value })))

/**
 * The request feeds both the pulse bar, which is as wide as the page, and this
 * table, which stays at a length somebody might actually read.
 */
const recentChecks = computed(() => [...(heartbeats.value ?? [])].reverse().slice(0, MONITOR_RECENT_TABLE_ROWS))
</script>

<template>
  <UDashboardPanel
    v-if="monitor"
    id="monitor-detail"
  >
    <template #header>
      <UDashboardNavbar :title="monitor.name">
        <template #leading>
          <AppSidebarCollapse />
          <UButton
            to="/monitors"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :aria-label="$t('monitor.title')"
          />
        </template>

        <template #trailing>
          <MonitorStatusBadge
            :status="monitor.state.status"
            mobile-icon-only
          />
        </template>

        <template #right>
          <template v-if="isAdmin">
            <UButton
              color="neutral"
              variant="subtle"
              :loading="pending === monitor.id"
              :label="$t('monitor.actions.checkNow')"
              :aria-label="$t('monitor.actions.checkNow')"
              :ui="{ base: 'px-2 sm:px-2.5', label: 'hidden sm:inline' }"
              @click="checkNow(monitor)"
            >
              <template #leading="{ ui }">
                <AppMorphIcon
                  :name="succeededId === monitor.id ? 'check' : 'refreshCw'"
                  :class="ui.leadingIcon({ class: pending === monitor.id ? 'animate-spin' : '' })"
                />
              </template>
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :aria-label="$t(monitor.active ? 'monitor.actions.pause' : 'monitor.actions.resume')"
              @click="toggleActive(monitor)"
            >
              <template #leading="{ ui }">
                <AppMorphIcon
                  :name="monitor.active ? 'pause' : 'play'"
                  :class="ui.leadingIcon()"
                />
              </template>
            </UButton>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              :aria-label="$t('common.edit')"
              @click="formOpen = true"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              :aria-label="$t('common.delete')"
              @click="deleteOpen = true"
            />
          </template>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar :ui="{ left: 'min-w-0 flex-1' }">
        <template #left>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted min-w-0">
            <ULink
              v-if="monitor.type === 'http'"
              :to="monitor.url"
              target="_blank"
              class="inline-flex items-center gap-1 hover:text-primary truncate-target"
            >
              {{ target }}
              <UIcon
                name="i-lucide-external-link"
                class="size-3.5 shrink-0"
              />
            </ULink>
            <span
              v-else
              class="font-mono"
            >{{ target }}</span>

            <UTooltip :text="$t(copied ? 'monitor.actions.copiedTarget' : 'monitor.actions.copyTarget')">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :aria-label="$t(copied ? 'monitor.actions.copiedTarget' : 'monitor.actions.copyTarget')"
                @click="copyTarget"
              >
                <template #leading="{ ui }">
                  <AppMorphIcon
                    :name="copied ? 'check' : 'copy'"
                    :class="ui.leadingIcon()"
                  />
                </template>
              </UButton>
            </UTooltip>

            <span class="text-dimmed">·</span>
            <span>{{ $t(`monitor.type.${monitor.type}`) }}</span>
            <span class="text-dimmed">·</span>
            <span>{{ $t('monitor.detail.interval', { seconds: formatDuration(monitor.intervalSeconds) }) }}</span>
            <template v-if="monitor.description">
              <span class="text-dimmed">·</span>
              <span class="truncate-target">{{ monitor.description }}</span>
            </template>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <UCard>
          <p class="text-sm text-muted">
            {{ $t('monitor.detail.uptime') }} · {{ $t(`range.${range}`) }}
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">
            {{ formatUptime(stats?.uptime.ratio ?? null) }}
          </p>
        </UCard>

        <UCard>
          <p class="text-sm text-muted">
            {{ $t('monitor.detail.avgResponseTime') }}
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">
            {{ formatLatency(stats?.uptime.avgLatencyMs ?? null) }}
          </p>
        </UCard>

        <UCard>
          <p class="text-sm text-muted">
            {{ $t('monitor.detail.lastCheck') }}
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">
            {{ formatRelativeTime(monitor.state.lastCheckedAt) }}
          </p>
          <p class="mt-1 text-xs text-dimmed truncate-target">
            {{ monitor.state.message ?? '—' }}
          </p>
        </UCard>

        <UCard>
          <p class="text-sm text-muted">
            {{ $t('monitor.detail.certificate') }}
          </p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
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
            class="mt-1 text-xs text-dimmed"
          >
            {{ $t('monitor.detail.certificateValidUntil', { date: formatDate(monitor.state.certificateExpiresAt) }) }}
          </p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-semibold text-highlighted">
                {{ $t('monitor.detail.responseTime') }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ $t('monitor.detail.avgResponseTime') }}
              </p>
            </div>
            <USelectMenu
              v-model="range"
              :items="rangeItems"
              value-key="value"
              :search-input="false"
              size="sm"
              class="w-36"
            />
          </div>
        </template>

        <MonitorLatencyChart
          :points="stats?.points ?? []"
          :height="240"
        />
      </UCard>

      <UCard
        :title="$t('monitor.detail.history')"
        :description="$t('monitor.detail.noHistory')"
        :ui="{ description: recentChecks.length ? 'hidden' : '' }"
      >
        <MonitorHeartbeatBar :heartbeats="heartbeats" />

        <div
          v-if="recentChecks.length"
          class="mt-6 -mx-4 sm:-mx-6 overflow-x-auto"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-muted border-b border-default">
                <th class="py-2 px-4 sm:px-6 font-medium">
                  {{ $t('monitor.detail.checkedAt') }}
                </th>
                <th class="py-2 pe-4 font-medium">
                  {{ $t('status.up') }}
                </th>
                <th class="py-2 pe-4 font-medium text-right">
                  {{ $t('monitor.detail.responseTime') }}
                </th>
                <th class="py-2 pe-4 font-medium text-right">
                  {{ $t('monitor.detail.statusCode') }}
                </th>
                <th class="py-2 pe-4 sm:pe-6 font-medium">
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
                <td class="py-2.5 px-4 sm:px-6 whitespace-nowrap text-muted tabular-nums">
                  {{ formatDateTime(heartbeat.checkedAt) }}
                </td>
                <td class="py-2.5 pe-4">
                  <MonitorStatusBadge
                    :status="heartbeat.status"
                    size="sm"
                  />
                </td>
                <td class="py-2.5 pe-4 text-right tabular-nums">
                  {{ formatLatency(heartbeat.latencyMs) }}
                </td>
                <td class="py-2.5 pe-4 text-right tabular-nums text-muted">
                  {{ heartbeat.statusCode ?? '—' }}
                </td>
                <td class="py-2.5 pe-4 sm:pe-6 text-muted">
                  {{ heartbeat.message ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
    </template>
  </UDashboardPanel>
</template>
