<script setup lang="ts">
import type { NotificationChannel, NotificationGroup } from '#shared/types/notification'

definePageMeta({ middleware: 'admin' })

const { t } = useI18n()

const { data: channels, refresh: refreshChannels } = useNotificationChannels()
const { data: groups, refresh: refreshGroups } = useNotificationGroups()
const { data: deliveries, refresh: refreshDeliveries } = useNotificationDeliveries()

useSeoMeta({ title: () => t('notification.title') })

// The log is the one thing here that changes without anybody touching the page.
usePolling(refreshDeliveries)

const channelOpen = ref(false)
const groupOpen = ref(false)
const editingChannel = ref<NotificationChannel | null>(null)
const editingGroup = ref<NotificationGroup | null>(null)

function createChannel() {
  editingChannel.value = null
  channelOpen.value = true
}

function editChannel(channel: NotificationChannel) {
  editingChannel.value = channel
  channelOpen.value = true
}

function createGroup() {
  editingGroup.value = null
  groupOpen.value = true
}

function editGroup(group: NotificationGroup) {
  editingGroup.value = group
  groupOpen.value = true
}

/**
 * A saved channel can change what a group shows and what the log names, so both
 * caches are refreshed rather than patched — none of this is hot.
 */
async function onChannelSaved() {
  await Promise.all([refreshChannels(), refreshGroups()])
}

async function onGroupSaved() {
  await refreshGroups()
}
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar
        :title="$t('notification.title')"
        icon="i-lucide-bell"
      >
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-plus"
            :label="$t('notification.groups.create')"
            @click="createGroup"
          />
          <UButton
            icon="i-lucide-plus"
            :label="$t('notification.channels.create')"
            @click="createChannel"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full max-w-3xl flex flex-col gap-4 sm:gap-6">
        <UCard
          :title="$t('notification.groups.title')"
          :description="$t('notification.groups.description')"
        >
          <NotificationGroupList
            :groups="groups"
            :channels="channels"
            @edit="editGroup"
            @deleted="onGroupSaved"
          />
        </UCard>

        <UCard
          :title="$t('notification.channels.title')"
          :description="$t('notification.channels.description')"
        >
          <NotificationChannelList
            :channels="channels"
            @edit="editChannel"
            @deleted="onChannelSaved"
          />
        </UCard>

        <UCard
          :title="$t('notification.delivery.title')"
          :description="$t('notification.delivery.description')"
        >
          <NotificationDeliveryLog :deliveries="deliveries" />
        </UCard>

        <!-- Inside the body slot: content in the panel's default slot would
             replace its header and body entirely. -->
        <NotificationChannelFormModal
          v-model:open="channelOpen"
          :channel="editingChannel"
          @saved="onChannelSaved"
        />

        <NotificationGroupFormModal
          v-model:open="groupOpen"
          :group="editingGroup"
          @saved="onGroupSaved"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
