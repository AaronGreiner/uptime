<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Monitor, MonitorStatus, MonitorWithState } from '#shared/types/monitor'

const { t } = useI18n()
const { isAdmin } = useAdmin()
const { data: monitors, refresh } = await useMonitors()
const { refresh: refreshSummary } = useStatusSummary()

useSeoMeta({ title: () => t('monitor.title') })

async function reload() {
  await Promise.all([refresh(), refreshSummary()])
}

const { pending, checkNow, toggleActive, remove } = useMonitorActions(reload)

const search = ref('')
const statusFilter = ref<MonitorStatus | 'all'>('all')

const formOpen = ref(false)
const deleteOpen = ref(false)
const editedMonitor = ref<Monitor | null>(null)
const monitorToDelete = ref<Monitor | null>(null)

const statusItems = computed(() => ([
  { label: t('common.all'), value: 'all' as const },
  ...(['up', 'down', 'pending', 'paused'] as const).map(status => ({ label: t(`status.${status}`), value: status }))
]))

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()

  return monitors.value.filter((monitor) => {
    const matchesStatus = statusFilter.value === 'all' || monitor.state.status === statusFilter.value
    const matchesTerm = !term
      || monitor.name.toLowerCase().includes(term)
      || monitorTarget(monitor).toLowerCase().includes(term)

    return matchesStatus && matchesTerm
  })
})

function openForm(monitor: Monitor | null) {
  editedMonitor.value = monitor
  formOpen.value = true
}

function menuItems(monitor: MonitorWithState): DropdownMenuItem[][] {
  return [[{
    label: t('common.edit'),
    icon: 'i-lucide-pencil',
    onSelect: () => openForm(monitor)
  }, {
    label: t('monitor.actions.checkNow'),
    icon: 'i-lucide-refresh-cw',
    onSelect: () => checkNow(monitor)
  }, {
    label: t(monitor.active ? 'monitor.actions.pause' : 'monitor.actions.resume'),
    icon: monitor.active ? 'i-lucide-pause' : 'i-lucide-play',
    onSelect: () => toggleActive(monitor)
  }], [{
    label: t('common.delete'),
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => {
      monitorToDelete.value = monitor
      deleteOpen.value = true
    }
  }]]
}

async function confirmDelete() {
  if (monitorToDelete.value && await remove(monitorToDelete.value)) {
    deleteOpen.value = false
    monitorToDelete.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="monitors">
    <template #header>
      <UDashboardNavbar
        :title="$t('monitor.title')"
        icon="i-lucide-activity"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="isAdmin"
            icon="i-lucide-plus"
            :label="$t('monitor.create')"
            @click="openForm(null)"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar
        v-if="monitors.length"
        :ui="{ left: 'min-w-0 flex-1' }"
      >
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="$t('common.search')"
            class="min-w-0 flex-1 sm:flex-none sm:w-64"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            :search-input="false"
            class="w-36"
          />
        </template>

        <template #right>
          <span class="hidden sm:inline text-sm text-dimmed tabular-nums whitespace-nowrap">
            {{ $t('monitor.count', filtered.length) }}
          </span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div
        v-if="filtered.length"
        class="grid gap-4 sm:gap-6 sm:grid-cols-2 2xl:grid-cols-3"
      >
        <MonitorCard
          v-for="monitor in filtered"
          :key="monitor.id"
          :monitor="monitor"
        >
          <template
            v-if="isAdmin"
            #actions
          >
            <UDropdownMenu
              :items="menuItems(monitor)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                size="xs"
                color="neutral"
                variant="ghost"
                :loading="pending === monitor.id"
                :aria-label="$t('common.actions')"
              />
            </UDropdownMenu>
          </template>
        </MonitorCard>
      </div>

      <UEmpty
        v-else
        icon="i-lucide-activity"
        :title="monitors.length ? $t('common.none') : $t('monitor.empty.title')"
        :description="monitors.length ? undefined : $t(isAdmin ? 'monitor.empty.description' : 'monitor.empty.readonly')"
        class="flex-1"
      >
        <template
          v-if="isAdmin && !monitors.length"
          #actions
        >
          <UButton
            icon="i-lucide-plus"
            :label="$t('monitor.create')"
            @click="openForm(null)"
          />
        </template>
      </UEmpty>

      <template v-if="isAdmin">
        <MonitorFormModal
          v-model:open="formOpen"
          :monitor="editedMonitor"
          @saved="reload()"
        />

        <ConfirmModal
          v-model:open="deleteOpen"
          :title="$t('monitor.delete.title')"
          :description="$t('monitor.delete.description', { name: monitorToDelete?.name ?? '' })"
          :loading="pending !== null"
          @confirm="confirmDelete"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
