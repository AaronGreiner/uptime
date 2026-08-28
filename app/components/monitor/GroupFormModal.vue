<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { MonitorGroup, MonitorGroupNode } from '#shared/types/group'
import { MONITOR_GROUP_ICONS, MONITOR_GROUP_MAX_DEPTH, joinMonitorPath, monitorGroupIcon } from '#shared/utils/group'
import { monitorGroupInputSchema } from '#shared/utils/validation'
import type { MonitorGroupInput } from '#shared/utils/validation'

const props = defineProps<{
  /** Omit to create a new group. */
  group?: MonitorGroup | null
  /** Preselected parent when creating a subgroup from the tree. */
  parentId?: number | null
}>()

const emit = defineEmits<{ saved: [group: MonitorGroup] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { flatTree, byId } = useMonitorTree()

/** USelectMenu needs a concrete value, the API expects null for a root group. */
const ROOT_VALUE = 0

function createState(): MonitorGroupInput {
  return {
    name: props.group?.name ?? '',
    description: props.group?.description ?? null,
    icon: props.group?.icon ?? null,
    parentId: props.group ? props.group.parentId : props.parentId ?? null,
    notificationMode: props.group?.notificationMode ?? 'inherit',
    notificationGroupIds: props.group ? [...props.group.notificationGroupIds] : []
  }
}

const state = ref<MonitorGroupInput>(createState())
const submitting = ref(false)

// The modal stays mounted, so the form is reset whenever it opens.
watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState()
  }
})

const isEdit = computed(() => Boolean(props.group))

/** Ids that may not become the parent: the group itself and its descendants. */
const forbiddenParents = computed(() => {
  if (!props.group) {
    return new Set<number>()
  }

  const node = flatTree.value.find(entry => entry.id === props.group!.id)

  const collect = (current: MonitorGroupNode): number[] => [current.id, ...current.children.flatMap(collect)]

  return new Set(node ? collect(node) : [props.group.id])
})

/**
 * A group can only be nested under a parent that leaves room for its own
 * subtree, so branches that would breach the depth limit are left out.
 */
const availableDepth = computed(() => {
  if (!props.group) {
    return MONITOR_GROUP_MAX_DEPTH - 1
  }

  const node = flatTree.value.find(entry => entry.id === props.group!.id)

  const height = (current: MonitorGroupNode): number =>
    current.children.length ? 1 + Math.max(...current.children.map(height)) : 1

  return MONITOR_GROUP_MAX_DEPTH - (node ? height(node) : 1)
})

const parentItems = computed(() => [
  { label: t('group.root'), value: ROOT_VALUE, icon: 'i-lucide-folder-tree' },
  ...flatTree.value
    .filter(node => !forbiddenParents.value.has(node.id) && node.depth < availableDepth.value)
    // The full path avoids indentation tricks and still reads unambiguously.
    .map(node => ({ label: joinMonitorPath(node.path), value: node.id, icon: monitorGroupIcon(node) }))
])

const selectedParent = computed({
  get: () => state.value.parentId ?? ROOT_VALUE,
  set: (value: number) => {
    state.value.parentId = value === ROOT_VALUE ? null : value
  }
})

const selectedIcon = computed(() => monitorGroupIcon(state.value))

/**
 * Where the group ends up, named in full. The parent's own path is unaffected
 * by the save, so the tree in hand is accurate even before it is reloaded.
 */
function savedPath(group: MonitorGroup): string {
  const parent = group.parentId === null ? undefined : byId.value.get(group.parentId)

  return joinMonitorPath([...(parent?.path ?? []), group.name])
}

/**
 * Icon names are not worth eighteen locale keys, but `i-lucide-book-open` is not
 * something to read out either, so the accessible name is derived from the name.
 */
function iconLabel(icon: string): string {
  return icon.replace(/^i-lucide-/, '').replace(/-/g, ' ')
}

async function onSubmit(event: FormSubmitEvent<MonitorGroupInput>) {
  submitting.value = true

  try {
    const saved = await $fetch<MonitorGroup>(
      isEdit.value ? `/api/groups/${props.group!.id}` : '/api/groups',
      { method: isEdit.value ? 'PATCH' : 'POST', body: event.data }
    )

    toast.add({
      title: t(isEdit.value ? 'group.updated' : 'group.created', { name: savedPath(saved) }),
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
    :title="$t(isEdit ? 'group.edit' : 'group.create')"
    :description="$t('group.formDescription')"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        id="group-form"
        :schema="monitorGroupInputSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="$t('group.fields.name')"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            :placeholder="$t('group.namePlaceholder')"
            autofocus
          >
            <template #leading>
              <UIcon
                :name="selectedIcon"
                class="size-5 text-dimmed"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField
          :label="$t('group.fields.parent')"
          name="parentId"
          :description="$t('group.hints.parent')"
        >
          <USelectMenu
            v-model="selectedParent"
            :items="parentItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="$t('group.fields.icon')"
          name="icon"
        >
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="$t('group.fields.icon')"
          >
            <UButton
              v-for="icon in MONITOR_GROUP_ICONS"
              :key="icon"
              :icon="icon"
              size="sm"
              :color="selectedIcon === icon ? 'primary' : 'neutral'"
              :variant="selectedIcon === icon ? 'subtle' : 'ghost'"
              :aria-label="iconLabel(icon)"
              :aria-pressed="selectedIcon === icon"
              @click="state.icon = icon"
            />
          </div>
        </UFormField>

        <UFormField
          :label="$t('group.fields.description')"
          name="description"
          :hint="$t('common.optional')"
        >
          <UInput
            :model-value="state.description ?? ''"
            class="w-full"
            @update:model-value="state.description = String($event) || null"
          />
        </UFormField>

        <USeparator />

        <NotificationAssignmentField
          v-model:mode="state.notificationMode"
          v-model:group-ids="state.notificationGroupIds"
          :inherit-from="state.parentId"
        />
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
          form="group-form"
          :loading="submitting"
          :label="$t(isEdit ? 'common.save' : 'common.create')"
        />
      </div>
    </template>
  </UModal>
</template>
