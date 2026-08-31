<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Dashboard, DashboardWidget } from '#shared/types/dashboard'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const { isAdmin } = useAdmin()

const slug = computed(() => String(route.params.slug))

const { data: dashboard, error, refresh: refreshDashboard } = await useDashboard(slug)
const { data: monitors } = await useMonitors()
const { refresh: refreshDashboards } = useDashboards()

// The widgets resolve their scope and their breadcrumbs from the group cache,
// which is usually filled by the sidebar rendering before them. Fullscreen has
// no sidebar, so the page waits for it here instead: a cache arriving halfway
// through the render would re-key the requests the widgets have already made.
await useMonitorGroups()

// Only a 404 means the dashboard is gone. Anything else — a restart, a dropped
// connection — is temporary, and claiming it does not exist would send the
// reader after the wrong problem.
if (error.value) {
  const missing = error.value.statusCode === 404

  throw createError({
    statusCode: missing ? 404 : (error.value.statusCode || 503),
    statusMessage: t(missing ? 'error.dashboardNotFound' : 'error.dashboardUnavailable'),
    fatal: true
  })
}

useSeoMeta({ title: () => dashboard.value?.name ?? t('nav.dashboards') })

const { isFullscreen, enter: enterFullscreen, exit: exitFullscreen } = useFullscreen()

const editing = ref(false)
const widgetModalOpen = ref(false)
const dashboardModalOpen = ref(false)
const deleteModalOpen = ref(false)
const deleting = ref(false)
const editedWidget = ref<DashboardWidget | null>(null)

// Leaving admin mode must not leave the page in an editable state.
watch(isAdmin, (value) => {
  if (!value) {
    editing.value = false
  }
})

watch(slug, () => {
  editing.value = false
})

// Fullscreen takes the toolbar and every editing control with it, so a layout
// cannot be arranged from inside it.
watch(isFullscreen, (active) => {
  if (active) {
    editing.value = false
  }
})

function openWidgetModal(widget: DashboardWidget | null) {
  editedWidget.value = widget
  widgetModalOpen.value = true
}

async function onDashboardSaved(saved: Dashboard) {
  await refreshDashboards()

  if (saved.slug === slug.value) {
    await refreshDashboard()
  } else {
    await router.push(`/d/${saved.slug}`)
  }
}

async function removeWidget(widget: DashboardWidget) {
  try {
    await $fetch(`/api/dashboards/${dashboard.value!.id}/widgets/${widget.id}`, { method: 'DELETE' })
    await refreshDashboard()
  } catch (fetchError) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(fetchError), color: 'error' })
  }
}

async function duplicateWidget(widget: DashboardWidget) {
  try {
    await $fetch(`/api/dashboards/${dashboard.value!.id}/widgets/${widget.id}/duplicate`, { method: 'POST' })
    await refreshDashboard()
    toast.add({ title: t('widget.duplicated'), color: 'success', icon: 'i-lucide-check' })
  } catch (fetchError) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(fetchError), color: 'error' })
  }
}

async function deleteDashboard() {
  deleting.value = true

  try {
    const name = dashboard.value!.name

    await $fetch(`/api/dashboards/${dashboard.value!.id}`, { method: 'DELETE' })
    await refreshDashboards()

    toast.add({ title: t('dashboard.deleted', { name }), color: 'success', icon: 'i-lucide-check' })
    deleteModalOpen.value = false
    await router.push('/')
  } catch (fetchError) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(fetchError), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [{
    label: t('dashboard.edit'),
    icon: 'i-lucide-pencil',
    onSelect: () => { dashboardModalOpen.value = true }
  }],
  [{
    label: t('common.delete'),
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => { deleteModalOpen.value = true }
  }]
])

const showToolbar = computed(() => Boolean(dashboard.value?.description) || editing.value)
</script>

<template>
  <UDashboardPanel
    v-if="dashboard"
    id="dashboard"
    :ui="isFullscreen ? { root: 'm-0 sm:m-0 rounded-none border-0' } : undefined"
  >
    <template #header>
      <!--
        Fullscreen leaves nothing on screen to press, so the way back is drawn
        over the grid rather than in a bar. It stays in the layout instead of
        appearing on hover — a wall display is usually a touch panel, and a mode
        that cannot be left on one is a trap — but it keeps quiet until it is
        pointed at.
      -->
      <UTooltip
        v-if="isFullscreen"
        :text="$t('dashboard.fullscreenExit')"
        :kbds="['esc']"
      >
        <UButton
          icon="i-lucide-minimize"
          color="neutral"
          variant="subtle"
          :aria-label="$t('dashboard.fullscreenExit')"
          class="absolute top-3 end-3 z-10 opacity-25 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          @click="exitFullscreen()"
        />
      </UTooltip>

      <UDashboardNavbar
        v-else
        :title="dashboard.name"
      >
        <template #leading="{ ui }">
          <AppSidebarCollapse />
          <UIcon
            :name="dashboardIcon(dashboard)"
            :class="ui.icon()"
          />
        </template>

        <template #right>
          <UTooltip :text="$t('dashboard.fullscreen')">
            <UButton
              icon="i-lucide-maximize"
              color="neutral"
              variant="ghost"
              :aria-label="$t('dashboard.fullscreen')"
              @click="enterFullscreen()"
            />
          </UTooltip>

          <template v-if="isAdmin">
            <UButton
              v-if="editing"
              icon="i-lucide-plus"
              color="neutral"
              variant="subtle"
              :label="$t('dashboard.addWidget')"
              :aria-label="$t('dashboard.addWidget')"
              :ui="{ base: 'px-2 sm:px-2.5', label: 'hidden sm:inline' }"
              @click="openWidgetModal(null)"
            />
            <UButton
              :color="editing ? 'primary' : 'neutral'"
              :variant="editing ? 'solid' : 'subtle'"
              :label="$t(editing ? 'dashboard.editModeDone' : 'dashboard.editMode')"
              :aria-label="$t(editing ? 'dashboard.editModeDone' : 'dashboard.editMode')"
              :ui="{ base: 'px-2 sm:px-2.5', label: 'hidden sm:inline' }"
              @click="editing = !editing"
            >
              <template #leading="{ ui }">
                <AppMorphIcon
                  :name="editing ? 'check' : 'pencilRuler'"
                  :class="ui.leadingIcon()"
                />
              </template>
            </UButton>
            <UDropdownMenu
              :items="menuItems"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                :aria-label="$t('common.actions')"
              />
            </UDropdownMenu>
          </template>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar
        v-if="showToolbar && !isFullscreen"
        :ui="{ left: 'min-w-0 flex-1' }"
      >
        <template #left>
          <p
            v-if="editing"
            class="flex items-center gap-2 text-sm text-muted min-w-0"
          >
            <UIcon
              name="i-lucide-move"
              class="size-4 shrink-0 text-primary"
            />
            <span class="truncate-target">{{ $t('dashboard.editModeHint') }}</span>
          </p>
          <p
            v-else
            class="text-sm text-muted truncate-target"
          >
            {{ dashboard.description }}
          </p>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <DashboardGrid
        v-if="dashboard.widgets.length"
        :dashboard="dashboard"
        :monitors="monitors"
        :editing="editing"
        @edit-widget="openWidgetModal($event)"
        @duplicate-widget="duplicateWidget($event)"
        @remove-widget="removeWidget($event)"
      />

      <UEmpty
        v-else
        icon="i-lucide-layout-dashboard"
        :title="$t('dashboard.empty.title')"
        :description="$t(isAdmin ? 'dashboard.empty.description' : 'dashboard.empty.readonly')"
        class="flex-1"
      >
        <template
          v-if="isAdmin"
          #actions
        >
          <UButton
            icon="i-lucide-plus"
            :label="$t('dashboard.addWidget')"
            @click="editing = true; openWidgetModal(null)"
          />
        </template>
      </UEmpty>

      <template v-if="isAdmin">
        <DashboardWidgetFormModal
          v-model:open="widgetModalOpen"
          :dashboard-id="dashboard.id"
          :widget="editedWidget"
          :monitors="monitors"
          @saved="refreshDashboard()"
        />

        <DashboardFormModal
          v-model:open="dashboardModalOpen"
          :dashboard="dashboard"
          @saved="onDashboardSaved"
        />

        <ConfirmModal
          v-model:open="deleteModalOpen"
          :title="$t('dashboard.delete.title')"
          :description="$t('dashboard.delete.description', { name: dashboard.name })"
          :loading="deleting"
          @confirm="deleteDashboard"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
