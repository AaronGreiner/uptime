<script setup lang="ts">
import type { NotificationMode } from '#shared/types/notification'
import { NOTIFICATION_MODES } from '#shared/utils/notification'

const props = defineProps<{
  /**
   * Monitor group the inheritance walk starts at: the group a monitor belongs
   * to, or the parent of the group being edited. Null means the record sits at
   * the root, where only the default groups are left.
   */
  inheritFrom: number | null
}>()

const mode = defineModel<NotificationMode>('mode', { required: true })
const groupIds = defineModel<number[]>('groupIds', { required: true })

const { t } = useI18n()
const { data: groups } = useNotificationGroups()
const inherited = useInheritedNotificationGroups(() => props.inheritFrom)

const modeItems = computed(() => NOTIFICATION_MODES.map(value => ({
  value,
  label: t(`notification.assignment.mode.${value}`),
  description: t(`notification.assignment.modeHint.${value}`)
})))

const groupItems = computed(() => groups.value.map(group => ({
  label: group.name,
  value: group.id,
  // A disabled group is still selectable; saying so beats hiding it and having
  // the assignment look complete while nothing is delivered.
  suffix: group.enabled ? undefined : t('notification.status.disabled')
})))

/** Named rather than counted: the point of the hint is knowing which ones. */
const inheritedNames = computed(() => inherited.value.map(group => group.name).join(', '))
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ $t('notification.assignment.label') }}
      </h3>
      <p class="text-sm text-muted">
        {{ $t('notification.assignment.description') }}
      </p>
    </div>

    <UFormField name="notificationMode">
      <URadioGroup
        v-model="mode"
        :items="modeItems"
        variant="table"
        class="w-full"
      />
    </UFormField>

    <UFormField
      v-if="mode === 'custom'"
      :label="$t('notification.assignment.groups')"
      name="notificationGroupIds"
    >
      <USelectMenu
        v-model="groupIds"
        :items="groupItems"
        value-key="value"
        multiple
        class="w-full"
        :placeholder="$t('notification.assignment.groupsPlaceholder')"
      />

      <template
        v-if="groupIds.length === 0"
        #help
      >
        <span class="text-warning">{{ $t('notification.assignment.noneSelected') }}</span>
      </template>
    </UFormField>

    <p
      v-else-if="mode === 'inherit'"
      class="text-sm text-muted"
    >
      <template v-if="inherited.length">
        {{ $t('notification.assignment.inherits', { groups: inheritedNames }) }}
      </template>
      <template v-else>
        {{ $t('notification.assignment.inheritsNothing') }}
      </template>
    </p>
  </div>
</template>
