<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Monitor, MonitorWithState } from '#shared/types/monitor'
import {
  MONITOR_INTERVAL_BOUNDS,
  MONITOR_PACKET_BOUNDS,
  MONITOR_RETRY_BOUNDS,
  MONITOR_TIMEOUT_BOUNDS,
  MONITOR_TYPES
} from '#shared/utils/monitor'
import { joinMonitorPath, monitorGroupIcon } from '#shared/utils/group'
import { HTTP_METHODS, monitorInputSchema } from '#shared/utils/validation'
import type { MonitorInput } from '#shared/utils/validation'

const props = defineProps<{
  /** Omit to create a new monitor. */
  monitor?: Monitor | null
  /** Preselected group, used when creating from a group section. */
  defaultGroupId?: number | null
}>()

const emit = defineEmits<{ saved: [monitor: MonitorWithState] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { flatTree } = useMonitorTree()
const { monitorPath } = useMonitorPath()
const { data: monitors } = useMonitors()

type HeaderRow = { name: string, value: string }

/** USelectMenu needs a concrete value, the API expects null for no group. */
const UNGROUPED_VALUE = 0

function createState(monitor?: Monitor | null): MonitorInput {
  return {
    name: monitor?.name ?? '',
    icon: monitor?.icon ?? null,
    type: monitor?.type ?? 'http',
    description: monitor?.description ?? null,
    groupId: monitor ? monitor.groupId : props.defaultGroupId ?? null,
    intervalSeconds: monitor?.intervalSeconds ?? 60,
    timeoutSeconds: monitor?.timeoutSeconds ?? 10,
    retries: monitor?.retries ?? 1,
    active: monitor?.active ?? true,
    url: monitor?.url ?? '',
    method: monitor?.method as MonitorInput['method'] ?? 'GET',
    headers: monitor?.headers ?? {},
    body: monitor?.body ?? null,
    expectedStatusCodes: monitor?.expectedStatusCodes ?? '200-299',
    keyword: monitor?.keyword ?? null,
    keywordInverted: monitor?.keywordInverted ?? false,
    followRedirects: monitor?.followRedirects ?? true,
    ignoreTls: monitor?.ignoreTls ?? false,
    checkCertificateExpiry: monitor?.checkCertificateExpiry ?? true,
    certificateExpiryWarningDays: monitor?.certificateExpiryWarningDays ?? 14,
    hostname: monitor?.hostname ?? '',
    packetCount: monitor?.packetCount ?? 3,
    notificationMode: monitor?.notificationMode ?? 'inherit',
    notificationGroupIds: monitor ? [...monitor.notificationGroupIds] : []
  }
}

const state = ref<MonitorInput>(createState(props.monitor))
const headerRows = ref<HeaderRow[]>([])
const submitting = ref(false)

/** The monitor the form was filled from, offered while creating one. */
const templateId = ref<number | null>(null)
const templateSearch = ref('')

function fillHeaderRows(headers: Record<string, string>) {
  headerRows.value = Object.entries(headers).map(([name, value]) => ({ name, value }))
}

// The modal is kept mounted, so the form is reset whenever it opens.
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  state.value = createState(props.monitor)
  templateId.value = null
  templateSearch.value = ''
  fillHeaderRows(props.monitor?.headers ?? {})
})

// Header rows are edited as a list but submitted as a record.
watch(headerRows, (rows) => {
  state.value.headers = Object.fromEntries(
    rows.filter(row => row.name.trim().length > 0).map(row => [row.name.trim(), row.value])
  )
}, { deep: true })

const isEdit = computed(() => Boolean(props.monitor))
const isHttp = computed(() => state.value.type === 'http')

const typeItems = computed(() => MONITOR_TYPES.map(type => ({
  label: t(`monitor.type.${type}`),
  value: type,
  description: t(`monitor.type.${type}Description`)
})))

const methodItems = HTTP_METHODS.map(method => ({ label: method, value: method }))

const groupItems = computed(() => [
  { label: t('group.none'), value: UNGROUPED_VALUE, icon: 'i-lucide-folder-tree' },
  // The full path keeps nested groups apart without indenting the menu.
  ...flatTree.value.map(node => ({ label: joinMonitorPath(node.path), value: node.id, icon: monitorGroupIcon(node) }))
])

const selectedGroup = computed({
  get: () => state.value.groupId ?? UNGROUPED_VALUE,
  set: (value: number) => {
    state.value.groupId = value === UNGROUPED_VALUE ? null : value
  }
})

const { filter: filterTemplates } = useMonitorPicker(() => monitors.value)
const templateResults = computed(() => filterTemplates(templateSearch.value))

/**
 * Fills the form from an existing monitor. Everything a check is made of comes
 * along; only the name stays, because that is the one field a duplicate has to
 * differ in.
 *
 * A group the dialog was opened from outranks the template's own: the reader is
 * standing in that group, while the template only happens to sit somewhere
 * else.
 */
function applyTemplate(template: Monitor) {
  const { name } = state.value

  state.value = createState(template)
  state.value.name = name
  state.value.groupId = props.defaultGroupId ?? template.groupId

  fillHeaderRows(template.headers)
}

watch(templateId, (id) => {
  const template = monitors.value.find(monitor => monitor.id === id)

  if (template) {
    applyTemplate(template)
  }
})

function addHeaderRow() {
  headerRows.value.push({ name: '', value: '' })
}

async function onSubmit(event: FormSubmitEvent<MonitorInput>) {
  submitting.value = true

  try {
    const saved = await $fetch<MonitorWithState>(
      isEdit.value ? `/api/monitors/${props.monitor!.id}` : '/api/monitors',
      { method: isEdit.value ? 'PATCH' : 'POST', body: event.data }
    )

    toast.add({
      title: t(isEdit.value ? 'monitor.updated' : 'monitor.created', { name: monitorPath(saved) }),
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
    :title="$t(isEdit ? 'monitor.edit' : 'monitor.create')"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <UForm
        id="monitor-form"
        :schema="monitorInputSchema"
        :state="state"
        class="space-y-6"
        @submit="onSubmit"
      >
        <section class="space-y-4">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('monitor.sections.general') }}
          </h3>

          <!--
            Outside the schema: the template only fills the fields below it, so
            it is never submitted and never validated.
          -->
          <UFormField
            v-if="!isEdit && monitors.length"
            :label="$t('monitor.fields.template')"
            :description="$t('monitor.hints.template')"
            :hint="$t('common.optional')"
          >
            <USelectMenu
              v-model="templateId"
              v-model:search-term="templateSearch"
              :items="templateResults"
              value-key="value"
              ignore-filter
              icon="i-lucide-copy"
              class="w-full"
              :placeholder="$t('monitor.templatePlaceholder')"
            >
              <template #item-label="{ item }">
                <AppHighlight
                  :text="item.label"
                  :query="templateSearch"
                />
              </template>
              <template #item-description="{ item }">
                <AppHighlight
                  :text="item.description"
                  :query="templateSearch"
                />
              </template>
            </USelectMenu>
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('monitor.fields.name')"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                class="w-full"
                placeholder="API"
              />
            </UFormField>

            <UFormField
              :label="$t('monitor.fields.type')"
              name="type"
              required
            >
              <USelectMenu
                v-model="state.type"
                :items="typeItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            :label="$t('iconPicker.label')"
            name="icon"
          >
            <AppIconPicker
              v-model="state.icon"
              :fallback-icon="monitorTypeIcon(state.type)"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('monitor.fields.group')"
              name="groupId"
              :description="$t('monitor.hints.group')"
            >
              <USelectMenu
                v-model="selectedGroup"
                :items="groupItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="$t('monitor.fields.description')"
              name="description"
              :hint="$t('common.optional')"
            >
              <UInput
                :model-value="state.description ?? ''"
                class="w-full"
                @update:model-value="state.description = String($event) || null"
              />
            </UFormField>
          </div>
        </section>

        <USeparator />

        <section class="space-y-4">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('monitor.sections.request') }}
          </h3>

          <template v-if="isHttp">
            <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
              <UFormField
                :label="$t('monitor.fields.url')"
                name="url"
                required
              >
                <UInput
                  v-model="state.url"
                  class="w-full"
                  placeholder="https://example.com"
                  type="url"
                />
              </UFormField>

              <UFormField
                :label="$t('monitor.fields.method')"
                name="method"
              >
                <USelectMenu
                  v-model="state.method"
                  :items="methodItems"
                  value-key="value"
                  :search-input="false"
                  class="w-32"
                />
              </UFormField>
            </div>

            <UFormField
              :label="$t('monitor.fields.expectedStatusCodes')"
              name="expectedStatusCodes"
              :description="$t('monitor.hints.expectedStatusCodes')"
            >
              <UInput
                v-model="state.expectedStatusCodes"
                class="w-full font-mono"
                placeholder="200-299"
              />
            </UFormField>

            <UFormField
              :label="$t('monitor.fields.headers')"
              name="headers"
              :hint="$t('common.optional')"
            >
              <div class="space-y-2">
                <div
                  v-for="(row, index) in headerRows"
                  :key="index"
                  class="flex gap-2"
                >
                  <UInput
                    v-model="row.name"
                    class="flex-1"
                    :placeholder="$t('monitor.fields.headerName')"
                  />
                  <UInput
                    v-model="row.value"
                    class="flex-1"
                    :placeholder="$t('monitor.fields.headerValue')"
                  />
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    :aria-label="$t('common.delete')"
                    @click="headerRows.splice(index, 1)"
                  />
                </div>

                <UButton
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  :label="$t('common.add')"
                  @click="addHeaderRow"
                />
              </div>
            </UFormField>

            <UFormField
              :label="$t('monitor.fields.keyword')"
              name="keyword"
              :description="$t('monitor.hints.keyword')"
              :hint="$t('common.optional')"
            >
              <UInput
                :model-value="state.keyword ?? ''"
                class="w-full"
                @update:model-value="state.keyword = String($event) || null"
              />
            </UFormField>

            <UFormField
              v-if="state.keyword"
              name="keywordInverted"
            >
              <UCheckbox
                v-model="state.keywordInverted"
                :label="$t('monitor.fields.keywordInverted')"
              />
            </UFormField>

            <UFormField
              v-if="state.method !== 'GET' && state.method !== 'HEAD'"
              :label="$t('monitor.fields.body')"
              name="body"
              :hint="$t('common.optional')"
            >
              <UTextarea
                :model-value="state.body ?? ''"
                class="w-full font-mono"
                :rows="4"
                @update:model-value="state.body = String($event) || null"
              />
            </UFormField>
          </template>

          <template v-else>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                :label="$t('monitor.fields.hostname')"
                name="hostname"
                required
              >
                <UInput
                  v-model="state.hostname"
                  class="w-full"
                  placeholder="1.1.1.1"
                />
              </UFormField>

              <UFormField
                :label="$t('monitor.fields.packetCount')"
                name="packetCount"
              >
                <UInputNumber
                  v-model="state.packetCount"
                  class="w-full"
                  :min="MONITOR_PACKET_BOUNDS.min"
                  :max="MONITOR_PACKET_BOUNDS.max"
                />
              </UFormField>
            </div>
          </template>
        </section>

        <USeparator />

        <section class="space-y-4">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('monitor.sections.schedule') }}
          </h3>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              :label="$t('monitor.fields.intervalSeconds')"
              name="intervalSeconds"
              :description="$t('monitor.hints.interval')"
            >
              <UInputNumber
                v-model="state.intervalSeconds"
                class="w-full"
                :min="MONITOR_INTERVAL_BOUNDS.min"
                :max="MONITOR_INTERVAL_BOUNDS.max"
              />
            </UFormField>

            <UFormField
              :label="$t('monitor.fields.timeoutSeconds')"
              name="timeoutSeconds"
              :description="$t('monitor.hints.timeout')"
            >
              <UInputNumber
                v-model="state.timeoutSeconds"
                class="w-full"
                :min="MONITOR_TIMEOUT_BOUNDS.min"
                :max="MONITOR_TIMEOUT_BOUNDS.max"
              />
            </UFormField>

            <UFormField
              :label="$t('monitor.fields.retries')"
              name="retries"
              :description="$t('monitor.hints.retries')"
            >
              <UInputNumber
                v-model="state.retries"
                class="w-full"
                :min="MONITOR_RETRY_BOUNDS.min"
                :max="MONITOR_RETRY_BOUNDS.max"
              />
            </UFormField>
          </div>

          <UFormField
            name="active"
            :description="$t('monitor.hints.active')"
          >
            <USwitch
              v-model="state.active"
              :label="$t('monitor.fields.active')"
            />
          </UFormField>
        </section>

        <template v-if="isHttp">
          <USeparator />

          <section class="space-y-4">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ $t('monitor.sections.advanced') }}
            </h3>

            <UFormField name="followRedirects">
              <UCheckbox
                v-model="state.followRedirects"
                :label="$t('monitor.fields.followRedirects')"
              />
            </UFormField>

            <UFormField
              name="ignoreTls"
              :description="$t('monitor.hints.ignoreTls')"
            >
              <UCheckbox
                v-model="state.ignoreTls"
                :label="$t('monitor.fields.ignoreTls')"
              />
            </UFormField>

            <UFormField name="checkCertificateExpiry">
              <UCheckbox
                v-model="state.checkCertificateExpiry"
                :label="$t('monitor.fields.checkCertificateExpiry')"
              />
            </UFormField>

            <UFormField
              v-if="state.checkCertificateExpiry"
              :label="$t('monitor.fields.certificateExpiryWarningDays')"
              name="certificateExpiryWarningDays"
            >
              <UInputNumber
                v-model="state.certificateExpiryWarningDays"
                class="w-full sm:w-40"
                :min="1"
                :max="90"
              />
            </UFormField>
          </section>
        </template>

        <section class="space-y-4">
          <NotificationAssignmentField
            v-model:mode="state.notificationMode"
            v-model:group-ids="state.notificationGroupIds"
            :inherit-from="state.groupId"
          />
        </section>
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
          form="monitor-form"
          :loading="submitting"
          :label="$t(isEdit ? 'common.save' : 'common.create')"
        />
      </div>
    </template>
  </UModal>
</template>
