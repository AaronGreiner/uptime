<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { NotificationGroup } from '#shared/types/notification'
import { notificationProviderIcon } from '#shared/utils/notification'
import { notificationGroupInputSchema } from '#shared/utils/validation'
import type { NotificationGroupInput } from '#shared/utils/validation'

const props = defineProps<{
  /** Omit to create a new group. */
  group?: NotificationGroup | null
}>()

const emit = defineEmits<{ saved: [group: NotificationGroup] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { data: channels } = useNotificationChannels()

function createState(): NotificationGroupInput {
  return {
    name: props.group?.name ?? '',
    description: props.group?.description ?? null,
    enabled: props.group?.enabled ?? true,
    notifyDown: props.group?.notifyDown ?? true,
    notifyUp: props.group?.notifyUp ?? true,
    notifyCertificateExpiring: props.group?.notifyCertificateExpiring ?? true,
    isDefault: props.group?.isDefault ?? false,
    channelIds: props.group ? [...props.group.channelIds] : []
  }
}

const state = ref<NotificationGroupInput>(createState())
const submitting = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState()
  }
})

const isEdit = computed(() => Boolean(props.group))

const channelItems = computed(() => channels.value.map(channel => ({
  label: channel.name,
  value: channel.id,
  icon: notificationProviderIcon(channel.provider)
})))

async function onSubmit(event: FormSubmitEvent<NotificationGroupInput>) {
  submitting.value = true

  try {
    const saved = await $fetch<NotificationGroup>(
      isEdit.value ? `/api/notifications/groups/${props.group!.id}` : '/api/notifications/groups',
      { method: isEdit.value ? 'PATCH' : 'POST', body: event.data }
    )

    toast.add({
      title: t(isEdit.value ? 'notification.groups.updated' : 'notification.groups.created', { name: saved.name }),
      color: 'success',
      icon: 'i-lucide-check'
    })

    emit('saved', saved)
    open.value = false
  } catch (error) {
    toast.add({
      title: t('common.error'),
      description: resolveErrorMessage(error),
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t(isEdit ? 'notification.groups.edit' : 'notification.groups.create')"
    :description="$t('notification.groups.formDescription')"
  >
    <template #body>
      <UForm
        id="notification-group-form"
        :schema="notificationGroupInputSchema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UFormField
          :label="$t('notification.form.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            :placeholder="$t('notification.groups.namePlaceholder')"
            autofocus
          />
        </UFormField>

        <UFormField
          :label="$t('notification.form.description')"
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
          :label="$t('notification.form.channels')"
          name="channelIds"
          :description="$t('notification.form.channelsHint')"
        >
          <USelectMenu
            v-model="state.channelIds"
            :items="channelItems"
            value-key="value"
            multiple
            class="w-full"
            :placeholder="$t('notification.form.channelsPlaceholder')"
          />
        </UFormField>

        <UFormField
          :label="$t('notification.form.events')"
          name="notifyDown"
          :description="$t('notification.form.eventsHint')"
        >
          <div class="flex flex-col gap-2 pt-1">
            <USwitch
              v-model="state.notifyDown"
              :label="$t('notification.event.down.label')"
            />
            <USwitch
              v-model="state.notifyUp"
              :label="$t('notification.event.up.label')"
            />
            <USwitch
              v-model="state.notifyCertificateExpiring"
              :label="$t('notification.event.certificate.label')"
            />
          </div>
        </UFormField>

        <div class="flex flex-col gap-3 pt-1">
          <USwitch
            v-model="state.enabled"
            :label="$t('notification.form.enabled')"
            :description="$t('notification.groups.enabledHint')"
          />
          <USwitch
            v-model="state.isDefault"
            :label="$t('notification.groups.default')"
            :description="$t('notification.groups.defaultHint')"
          />
        </div>
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
          form="notification-group-form"
          :loading="submitting"
          :label="$t(isEdit ? 'common.save' : 'common.create')"
        />
      </div>
    </template>
  </UModal>
</template>
