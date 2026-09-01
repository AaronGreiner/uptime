<script setup lang="ts">
import type { NotificationChannel, NotificationGroup } from '#shared/types/notification'
import { NOTIFICATION_EVENT_KEYS, notificationProviderIcon } from '#shared/utils/notification'

const props = defineProps<{
  groups: NotificationGroup[]
  channels: NotificationChannel[]
}>()

const emit = defineEmits<{ edit: [group: NotificationGroup], deleted: [] }>()

const { t } = useI18n()
const toast = useToast()

const confirming = ref<NotificationGroup | null>(null)
const removing = ref(false)

const channelsById = computed(() => new Map(props.channels.map(channel => [channel.id, channel])))

/** Only the events a group actually reacts to, so the row reads as a summary. */
function activeEvents(group: NotificationGroup): string[] {
  const flags = [
    ['monitor.down', group.notifyDown],
    ['monitor.up', group.notifyUp],
    ['monitor.certificate-expiring', group.notifyCertificateExpiring],
    ['instance.uplink-restored', group.notifyInstanceOffline]
  ] as const

  return flags
    .filter(([, on]) => on)
    .map(([type]) => t(`notification.event.${NOTIFICATION_EVENT_KEYS[type]}.label`))
}

async function onDelete() {
  const group = confirming.value

  if (!group) {
    return
  }

  removing.value = true

  try {
    await $fetch(`/api/notifications/groups/${group.id}`, { method: 'DELETE' })

    confirming.value = null
    emit('deleted')

    toast.add({ title: t('notification.groups.deleted', { name: group.name }), color: 'success', icon: 'i-lucide-check' })
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
      v-if="!groups.length"
      class="text-sm text-muted"
    >
      {{ $t('notification.groups.empty') }}
    </p>

    <div
      v-for="(group, index) in groups"
      :key="group.id"
      class="flex items-start gap-3 py-3"
      :class="index > 0 ? 'border-t border-default' : ''"
    >
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-highlighted truncate">{{ group.name }}</span>

          <UBadge
            v-if="group.isDefault"
            color="primary"
            variant="subtle"
            size="sm"
            :label="$t('notification.groups.default')"
          />
          <UBadge
            v-if="!group.enabled"
            color="neutral"
            variant="subtle"
            size="sm"
            :label="$t('notification.status.disabled')"
          />
        </div>

        <p
          v-if="group.description"
          class="text-sm text-muted"
        >
          {{ group.description }}
        </p>

        <p class="text-sm text-muted">
          {{ activeEvents(group).join(' · ') || $t('notification.groups.noEvents') }}
        </p>

        <!-- A group without channels is not an error, but it is worth saying. -->
        <div
          v-if="group.channelIds.length"
          class="flex flex-wrap items-center gap-1.5 pt-0.5"
        >
          <UBadge
            v-for="channelId in group.channelIds"
            :key="channelId"
            color="neutral"
            variant="subtle"
            size="sm"
            :icon="notificationProviderIcon(channelsById.get(channelId)?.provider ?? '')"
            :label="channelsById.get(channelId)?.name ?? '—'"
          />
        </div>
        <p
          v-else
          class="text-sm text-warning"
        >
          {{ $t('notification.groups.noChannels') }}
        </p>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="$t('common.edit')"
          @click="emit('edit', group)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="$t('common.delete')"
          @click="confirming = group"
        />
      </div>
    </div>

    <ConfirmModal
      :open="confirming !== null"
      :title="$t('notification.groups.deleteTitle')"
      :description="$t('notification.groups.deleteMessage', { name: confirming?.name ?? '' })"
      :confirm-label="$t('common.delete')"
      :loading="removing"
      @update:open="confirming = $event ? confirming : null"
      @confirm="onDelete"
    />
  </div>
</template>
