<script setup lang="ts">
import type { NotificationDelivery, NotificationDeliveryStatus } from '#shared/types/notification'
import { NOTIFICATION_EVENT_KEYS } from '#shared/utils/notification'

defineProps<{ deliveries: NotificationDelivery[] }>()

const { formatRelativeTime } = useFormatters()

const STATUS_COLORS: Record<NotificationDeliveryStatus, 'neutral' | 'success' | 'error'> = {
  pending: 'neutral',
  sent: 'success',
  failed: 'error'
}
</script>

<template>
  <div class="flex flex-col">
    <p
      v-if="!deliveries.length"
      class="text-sm text-muted"
    >
      {{ $t('notification.delivery.empty') }}
    </p>

    <div
      v-for="(delivery, index) in deliveries"
      :key="delivery.id"
      class="flex items-start gap-3 py-2.5"
      :class="index > 0 ? 'border-t border-default' : ''"
    >
      <UBadge
        :color="STATUS_COLORS[delivery.status]"
        variant="subtle"
        size="sm"
        class="mt-0.5 shrink-0"
        :label="$t(`notification.delivery.status.${delivery.status}`)"
      />

      <div class="min-w-0 flex-1">
        <p class="flex items-baseline gap-1 text-sm text-highlighted min-w-0">
          <MonitorPathLabel
            v-if="delivery.monitorName"
            :name="delivery.monitorName"
            :path="delivery.monitorGroupPath"
          />
          <span v-else>{{ $t('notification.instance') }}</span>
          <span class="shrink-0">·</span>
          <span class="min-w-0 truncate-target">{{ $t(`notification.event.${NOTIFICATION_EVENT_KEYS[delivery.eventType]}.label`) }}</span>
        </p>
        <p class="text-sm text-muted truncate">
          {{ delivery.channelName }} · {{ formatRelativeTime(delivery.createdAt) }}
          <template v-if="delivery.attempts > 1">
            · {{ $t('notification.delivery.attempts', { count: delivery.attempts }) }}
          </template>
        </p>
        <p
          v-if="delivery.lastError"
          class="text-sm text-error break-words"
        >
          {{ delivery.lastError }}
        </p>
      </div>
    </div>
  </div>
</template>
