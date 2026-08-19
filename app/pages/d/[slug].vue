<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DashboardWidget } from '#shared/types/dashboard'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const { isAdmin } = useAdmin()

const slug = computed(() => String(route.params.slug))

const { data: dashboard, error, refresh: refreshDashboard } = await useDashboard(slug)
const { data: monitors } = await useMonitors()
const { refresh: refreshDashboards } = useDashboards()

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: t('error.dashboardNotFound'), fatal: true })
}

useSeoMeta({ title: () => dashboard.value?.name ?? t('nav.dashboards') })

const editing = ref(false)
const widgetModalOpen = ref(false)
const dashboardModalOpen = ref(false)
const createModalOpen = ref(false)
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

function openWidgetModal(widget: DashboardWidget | null) {
  editedWidget.value = widget
  widgetModalOpen.value = true
}

async function removeWidget(widget: DashboardWidget) {
  try {
    await $fetch(`/api/dashboards/${dashboard.value!.id}/widgets/${widget.id}`, { method: 'DELETE' })
    await refreshDashboard()
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
  }, {
    label: t('dashboard.create'),
    icon: 'i-lucide-plus',
    onSelect: () => { createModalOpen.value = true }
  }],
  [{
    label: t('common.delete'),
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => { deleteModalOpen.value = true }
  }]
])
</script>

<template>
  <UContainer
    v-if="dashboard"
    class="py-6 sm:py-8 space-y-6"
  >
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold text-highlighted">
          {{ dashboard.name }}
        </h1>
        <p
          v-if="dashboard.description"
          class="text-sm text-muted mt-1"
        >
          {{ dashboard.description }}
        </p>
      </div>

      <div
        v-if="isAdmin"
        class="flex items-center gap-2"
      >
        <UButton
          v-if="editing"
          icon="i-lucide-plus"
          variant="subtle"
          :label="$t('dashboard.addWidget')"
          @click="openWidgetModal(null)"
        />
        <UButton
          :icon="editing ? 'i-lucide-check' : 'i-lucide-pencil-ruler'"
          :color="editing ? 'primary' : 'neutral'"
          :variant="editing ? 'solid' : 'subtle'"
          :label="$t(editing ? 'dashboard.editModeDone' : 'dashboard.editMode')"
          @click="editing = !editing"
        />
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
      </div>
    </header>

    <UAlert
      v-if="editing"
      color="neutral"
      variant="subtle"
      icon="i-lucide-move"
      :description="$t('dashboard.editModeHint')"
    />

    <DashboardGrid
      v-if="dashboard.widgets.length"
      :dashboard="dashboard"
      :monitors="monitors"
      :editing="editing"
      @edit-widget="openWidgetModal($event)"
      @remove-widget="removeWidget($event)"
    />

    <UEmpty
      v-else
      icon="i-lucide-layout-dashboard"
      :title="$t('dashboard.empty.title')"
      :description="$t(isAdmin ? 'dashboard.empty.description' : 'dashboard.empty.readonly')"
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
        @saved="refreshDashboards(); router.push(`/d/${$event.slug}`)"
      />

      <DashboardFormModal
        v-model:open="createModalOpen"
        @saved="refreshDashboards(); router.push(`/d/${$event.slug}`)"
      />

      <ConfirmModal
        v-model:open="deleteModalOpen"
        :title="$t('dashboard.delete.title')"
        :description="$t('dashboard.delete.description', { name: dashboard.name })"
        :loading="deleting"
        @confirm="deleteDashboard"
      />
    </template>
  </UContainer>
</template>
