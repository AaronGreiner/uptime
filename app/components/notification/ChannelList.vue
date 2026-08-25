<script setup lang="ts">
import type { NotificationChannel } from '#shared/types/notification'
import { notificationProviderIcon } from '#shared/utils/notification'

defineProps<{ channels: NotificationChannel[] }>()

const emit = defineEmits<{ edit: [channel: NotificationChannel], deleted: [] }>()

const { t } = useI18n()
const toast = useToast()
const { formatRelativeTime } = useFormatters()

const confirming = ref<NotificationChannel | null>(null)
const removing = ref(false)

async function onDelete() {
  const channel = confirming.value

  if (!channel) {
    return
  }

  removing.value = true

  try {
    await $fetch(`/api/notifications/channels/${channel.id}`, { method: 'DELETE' })

    confirming.value = null
    emit('deleted')

    toast.add({ title: t('notification.channels.deleted', { name: channel.name }), color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: t('common.error'), description: resolveErrorMessage(error), color: 'error' })
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col">
    <p
      v-if="!channels.length"
      class="text-sm text-muted"
    >
      {{ $t('notification.channels.empty') }}
    </p>

    <div
      v-for="(channel, index) in channels"
      :key="channel.id"
      class="flex items-start gap-3 py-3"
      :class="index > 0 ? 'border-t border-default' : ''"
    >
      <UIcon
        :name="notificationProviderIcon(channel.provider)"
        class="size-5 shrink-0 mt-0.5 text-dimmed"
      />

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-highlighted truncate">{{ channel.name }}</span>

          <UBadge
            v-if="!channel.enabled"
            color="neutral"
            variant="subtle"
            size="sm"
            :label="$t('notification.status.disabled')"
          />
          <UBadge
            v-else-if="channel.lastError"
            color="error"
            variant="subtle"
            size="sm"
            :label="$t('notification.status.error')"
          />
        </div>

        <p class="text-sm text-muted">
          {{ $t(`notification.provider.${channel.provider}`) }} ·
          {{ $t(`notification.language.${channel.language}`) }}
        </p>

        <!--
          The last error is shown in full rather than summarised: a self-hosted
          instance has nobody reading stderr, and the wording of a rejection is
          usually the only thing that identifies it.
        -->
        <p
          v-if="channel.lastError"
          class="text-sm text-error break-words"
        >
          {{ channel.lastError }}
        </p>
        <p
          v-else-if="channel.lastSuccessAt"
          class="text-sm text-muted"
        >
          {{ $t('notification.channels.lastSuccess', { time: formatRelativeTime(channel.lastSuccessAt) }) }}
        </p>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="$t('common.edit')"
          @click="emit('edit', channel)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="$t('common.delete')"
          @click="confirming = channel"
        />
      </div>
    </div>

    <ConfirmModal
      :open="confirming !== null"
      :title="$t('notification.channels.deleteTitle')"
      :description="$t('notification.channels.deleteMessage', { name: confirming?.name ?? '' })"
      :confirm-label="$t('common.delete')"
      :loading="removing"
      @update:open="confirming = $event ? confirming : null"
      @confirm="onDelete"
    />
  </div>
</template>
