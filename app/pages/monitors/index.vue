<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MonitorGroup, MonitorTreeNode } from '#shared/types/group'
import type { Monitor, MonitorStatus, MonitorWithState } from '#shared/types/monitor'
import { flattenMonitorGroupTree, monitorGroupIcon } from '#shared/utils/group'

const { t } = useI18n()
const { isAdmin } = useAdmin()
const route = useRoute()
const router = useRouter()

const { data: monitors, refresh } = await useMonitors()
const { tree, flatTree, byId, rootMonitors, rootTotals, refreshGroups } = useMonitorTree()

useSeoMeta({ title: () => t('monitor.title') })

/** Only needed after an edit; check results arrive over the event stream. */
async function reload() {
  await Promise.all([refresh(), refreshGroups()])
}

const { pending, checkNow, toggleActive, remove } = useMonitorActions(reload)
const { pending: groupPending, move: moveGroup, remove: removeGroup } = useMonitorGroupActions(reload)

const search = ref('')
const statusFilter = ref<MonitorStatus | 'all'>('all')

/** Survives navigation to a monitor and back, unlike a plain ref. */
const grouped = useState('monitors-grouped', () => true)

const formOpen = ref(false)
const deleteOpen = ref(false)
const editedMonitor = ref<Monitor | null>(null)
const monitorToDelete = ref<Monitor | null>(null)
const formGroupId = ref<number | null>(null)

const groupFormOpen = ref(false)
const groupDeleteOpen = ref(false)
const editedGroup = ref<MonitorGroup | null>(null)
const groupParentId = ref<number | null>(null)
const groupToDelete = ref<MonitorTreeNode | null>(null)

const statusItems = computed(() => ([
  { label: t('common.all'), value: 'all' as const },
  ...(['up', 'down', 'pending', 'paused'] as const).map(status => ({ label: t(`status.${status}`), value: status }))
]))

/** `all`, `none` for the monitors outside any group, or a group id. */
type GroupFilter = 'all' | 'none' | number

const groupFilter = computed<GroupFilter>(() => {
  const raw = route.query.group

  if (raw === 'none') {
    return 'none'
  }

  const id = Number(raw)

  return Number.isInteger(id) && id > 0 && byId.value.has(id) ? id : 'all'
})

/** The filter lives in the URL so the sidebar tree can link straight into it. */
function setGroupFilter(value: GroupFilter) {
  const query = { ...route.query, group: value === 'all' ? undefined : String(value) }

  router.replace({ query })
}

const groupFilterItems = computed(() => [
  { label: t('group.filterAll'), value: 'all' as const, icon: 'i-lucide-list' },
  ...flatTree.value.map(node => ({
    label: node.path.join(' / '),
    value: node.id as GroupFilter,
    icon: monitorGroupIcon(node)
  })),
  ...(rootTotals.value.total ? [{ label: t('group.ungrouped'), value: 'none' as const, icon: 'i-lucide-folder-tree' }] : [])
])

const hasTextFilters = computed(() => search.value.trim().length > 0 || statusFilter.value !== 'all')

function matches(monitor: MonitorWithState): boolean {
  const term = search.value.trim().toLowerCase()
  const matchesStatus = statusFilter.value === 'all' || monitor.state.status === statusFilter.value
  const matchesTerm = !term
    || monitor.name.toLowerCase().includes(term)
    || monitorTarget(monitor).toLowerCase().includes(term)

  return matchesStatus && matchesTerm
}

/** Group nodes the filter lets through, already flattened depth first. */
const visibleNodes = computed<MonitorTreeNode[]>(() => {
  if (groupFilter.value === 'none') {
    return []
  }

  if (groupFilter.value === 'all') {
    return flatTree.value
  }

  const node = byId.value.get(groupFilter.value)

  return node ? flattenMonitorGroupTree([node]) : []
})

const showUngrouped = computed(() => groupFilter.value === 'all' || groupFilter.value === 'none')

interface Section {
  key: string
  node: MonitorTreeNode | null
  monitors: MonitorWithState[]
}

/**
 * One section per group, in tree order. Empty groups stay visible for the admin
 * so they can still be managed, but disappear while a search is narrowing the
 * list down, where they would only be noise.
 */
const sections = computed<Section[]>(() => {
  const groupSections = visibleNodes.value
    .map(node => ({ key: `group-${node.id}`, node, monitors: node.monitors.filter(matches) }))
    .filter(section => section.monitors.length > 0 || (!hasTextFilters.value && isAdmin.value))

  if (!showUngrouped.value) {
    return groupSections
  }

  const ungrouped = rootMonitors.value.filter(matches)

  return ungrouped.length
    ? [...groupSections, { key: 'ungrouped', node: null, monitors: ungrouped }]
    : groupSections
})

/** Every monitor the filters let through, used by the flat view and the count. */
const filtered = computed(() => {
  const scoped = groupFilter.value === 'all'
    ? monitors.value
    : [...visibleNodes.value.flatMap(node => node.monitors), ...(showUngrouped.value ? rootMonitors.value : [])]

  return scoped.filter(matches)
})

function groupPathOf(monitor: MonitorWithState): string | undefined {
  return monitor.groupId === null ? undefined : byId.value.get(monitor.groupId)?.path.join(' / ')
}

function openForm(monitor: Monitor | null, groupId: number | null = null) {
  editedMonitor.value = monitor
  formGroupId.value = groupId
  formOpen.value = true
}

function openGroupForm(group: MonitorGroup | null, parentId: number | null = null) {
  editedGroup.value = group
  groupParentId.value = parentId
  groupFormOpen.value = true
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

function groupMenuItems(node: MonitorTreeNode): DropdownMenuItem[][] {
  const siblings = flatTree.value.filter(entry => entry.parentId === node.parentId)
  const index = siblings.findIndex(entry => entry.id === node.id)

  return [[{
    label: t('monitor.create'),
    icon: 'i-lucide-plus',
    onSelect: () => openForm(null, node.id)
  }, {
    label: t('group.addChild'),
    icon: 'i-lucide-folder-plus',
    onSelect: () => openGroupForm(null, node.id)
  }], [{
    label: t('common.edit'),
    icon: 'i-lucide-pencil',
    onSelect: () => openGroupForm(node)
  }, {
    label: t('group.moveUp'),
    icon: 'i-lucide-arrow-up',
    disabled: index <= 0,
    onSelect: () => moveGroup(node, 'up')
  }, {
    label: t('group.moveDown'),
    icon: 'i-lucide-arrow-down',
    disabled: index === -1 || index >= siblings.length - 1,
    onSelect: () => moveGroup(node, 'down')
  }], [{
    label: t('common.delete'),
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => {
      groupToDelete.value = node
      groupDeleteOpen.value = true
    }
  }]]
}

async function confirmDelete() {
  if (monitorToDelete.value && await remove(monitorToDelete.value)) {
    deleteOpen.value = false
    monitorToDelete.value = null
  }
}

async function confirmGroupDelete() {
  if (groupToDelete.value && await removeGroup(groupToDelete.value)) {
    groupDeleteOpen.value = false
    groupToDelete.value = null
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
          <AppSidebarCollapse />
        </template>

        <template #right>
          <template v-if="isAdmin">
            <UButton
              icon="i-lucide-folder-plus"
              color="neutral"
              variant="subtle"
              :label="$t('group.create')"
              :aria-label="$t('group.create')"
              :ui="{ base: 'px-2 sm:px-2.5', label: 'hidden sm:inline' }"
              @click="openGroupForm(null)"
            />
            <UButton
              icon="i-lucide-plus"
              :label="$t('monitor.create')"
              :aria-label="$t('monitor.create')"
              :ui="{ base: 'px-2 sm:px-2.5', label: 'hidden sm:inline' }"
              @click="openForm(null)"
            />
          </template>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar
        v-if="monitors.length"
        :ui="{ root: 'block py-2 sm:flex sm:py-0' }"
      >
        <div class="grid w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_auto] items-center gap-1.5 sm:flex">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="$t('common.search')"
            class="col-span-3 min-w-0 w-full sm:col-span-1 sm:w-56 sm:flex-none"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            :search-input="false"
            class="min-w-0 w-full sm:w-36 sm:flex-none"
          />
          <USelectMenu
            v-if="tree.length"
            :model-value="groupFilter"
            :items="groupFilterItems"
            value-key="value"
            class="min-w-0 w-full sm:w-44 sm:flex-none"
            @update:model-value="setGroupFilter($event)"
          />

          <span class="hidden sm:inline sm:ms-auto text-sm text-dimmed tabular-nums whitespace-nowrap">
            {{ $t('monitor.count', filtered.length) }}
          </span>

          <UTooltip
            v-if="tree.length"
            :text="$t(grouped ? 'group.viewFlat' : 'group.viewGrouped')"
          >
            <UButton
              :color="grouped ? 'primary' : 'neutral'"
              :variant="grouped ? 'subtle' : 'ghost'"
              :aria-label="$t('group.viewGrouped')"
              :aria-pressed="grouped"
              size="sm"
              @click="grouped = !grouped"
            >
              <template #leading="{ ui }">
                <AppMorphIcon
                  :name="grouped ? 'folderTree' : 'layoutGrid'"
                  :class="ui.leadingIcon()"
                />
              </template>
            </UButton>
          </UTooltip>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Grouped view: one section per group, in tree order. -->
      <template v-if="grouped && tree.length && sections.length">
        <section
          v-for="section in sections"
          :key="section.key"
          class="space-y-3"
        >
          <div class="flex items-center gap-2 min-w-0">
            <UIcon
              :name="section.node ? monitorGroupIcon(section.node) : 'i-lucide-folder-tree'"
              class="size-4 shrink-0 text-dimmed"
            />

            <h2 class="min-w-0 font-medium text-highlighted truncate-target">
              <span
                v-if="section.node && section.node.depth > 0"
                class="text-dimmed font-normal"
              >{{ section.node.path.slice(0, -1).join(' / ') }} / </span>
              {{ section.node ? section.node.name : $t('group.ungrouped') }}
            </h2>

            <UBadge
              v-if="section.node && section.node.totals.down > 0"
              color="error"
              variant="subtle"
              size="sm"
            >
              {{ $t('monitor.downCount', section.node.totals.down) }}
            </UBadge>
            <span
              v-else
              class="text-xs text-dimmed tabular-nums shrink-0"
            >{{ section.monitors.length }}</span>

            <p
              v-if="section.node?.description"
              class="hidden lg:block min-w-0 text-sm text-dimmed truncate-target"
            >
              {{ section.node.description }}
            </p>

            <div class="ms-auto shrink-0">
              <UDropdownMenu
                v-if="isAdmin && section.node"
                :items="groupMenuItems(section.node)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :loading="groupPending === section.node.id"
                  :aria-label="$t('common.actions')"
                />
              </UDropdownMenu>
            </div>
          </div>

          <div
            v-if="section.monitors.length"
            class="grid gap-3 sm:gap-6 sm:grid-cols-2 2xl:grid-cols-3"
          >
            <MonitorCard
              v-for="monitor in section.monitors"
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

          <!--
            Only reachable for the admin, who is the one who can fill it. A group
            that merely holds subgroups is not empty, its content follows below.
          -->
          <p
            v-else-if="!section.node?.children.length"
            class="text-sm text-dimmed"
          >
            {{ $t('group.emptyGroup') }}
          </p>
        </section>
      </template>

      <div
        v-else-if="filtered.length"
        class="grid gap-3 sm:gap-6 sm:grid-cols-2 2xl:grid-cols-3"
      >
        <MonitorCard
          v-for="monitor in filtered"
          :key="monitor.id"
          :monitor="monitor"
          :group-path="groupPathOf(monitor)"
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
          :default-group-id="formGroupId"
          @saved="reload()"
        />

        <MonitorGroupFormModal
          v-model:open="groupFormOpen"
          :group="editedGroup"
          :parent-id="groupParentId"
          @saved="reload()"
        />

        <ConfirmModal
          v-model:open="deleteOpen"
          :title="$t('monitor.delete.title')"
          :description="$t('monitor.delete.description', { name: monitorToDelete?.name ?? '' })"
          :loading="pending !== null"
          @confirm="confirmDelete"
        />

        <ConfirmModal
          v-model:open="groupDeleteOpen"
          :title="$t('group.delete.title')"
          :description="$t('group.delete.description', { name: groupToDelete?.name ?? '' })"
          :loading="groupPending !== null"
          @confirm="confirmGroupDelete"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
