<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Dashboard } from '#shared/types/dashboard'
import { dashboardInputSchema } from '#shared/utils/validation'
import type { DashboardInput } from '#shared/utils/validation'

const props = defineProps<{
  /** Omit to create a new dashboard. */
  dashboard?: Dashboard | null
}>()

const emit = defineEmits<{ saved: [dashboard: Dashboard] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()

function createState(dashboard?: Dashboard | null): DashboardInput {
  return {
    name: dashboard?.name ?? '',
    slug: dashboard?.slug ?? '',
    description: dashboard?.description ?? null,
    isDefault: dashboard?.isDefault ?? false
  }
}

const state = ref<DashboardInput>(createState(props.dashboard))
const submitting = ref(false)
const slugTouched = ref(false)

const isEdit = computed(() => Boolean(props.dashboard))

watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState(props.dashboard)
    slugTouched.value = isEdit.value
  }
})

// The slug follows the name until it is edited by hand.
watch(() => state.value.name, (name) => {
  if (!slugTouched.value) {
    state.value.slug = slugify(name)
  }
})

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function onSubmit(event: FormSubmitEvent<DashboardInput>) {
  submitting.value = true

  try {
    const saved = await $fetch<Dashboard>(
      isEdit.value ? `/api/dashboards/${props.dashboard!.id}` : '/api/dashboards',
      { method: isEdit.value ? 'PATCH' : 'POST', body: event.data }
    )

    toast.add({
      title: t(isEdit.value ? 'dashboard.updated' : 'dashboard.created', { name: saved.name }),
      color: 'success',
      icon: 'i-lucide-check'
    })

    emit('saved', saved)
    open.value = false
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t(isEdit ? 'dashboard.edit' : 'dashboard.create')"
  >
    <template #body>
      <UForm
        id="dashboard-form"
        :schema="dashboardInputSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="$t('dashboard.fields.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            placeholder="Production"
          />
        </UFormField>

        <UFormField
          :label="$t('dashboard.fields.slug')"
          name="slug"
          :description="$t('dashboard.hints.slug')"
          required
        >
          <UInput
            v-model="state.slug"
            class="w-full font-mono"
            @update:model-value="slugTouched = true"
          />
        </UFormField>

        <UFormField
          :label="$t('dashboard.fields.description')"
          name="description"
          :hint="$t('common.optional')"
        >
          <UInput
            :model-value="state.description ?? ''"
            class="w-full"
            @update:model-value="state.description = String($event) || null"
          />
        </UFormField>

        <UFormField
          name="isDefault"
          :description="$t('dashboard.hints.isDefault')"
        >
          <USwitch
            v-model="state.isDefault"
            :label="$t('dashboard.fields.isDefault')"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="$t('common.cancel')"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="dashboard-form"
          :loading="submitting"
          :label="$t(isEdit ? 'common.save' : 'common.create')"
        />
      </div>
    </template>
  </UModal>
</template>
