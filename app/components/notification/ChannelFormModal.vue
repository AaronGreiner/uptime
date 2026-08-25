<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { NotificationChannel, NotificationLocale, NotificationProviderId } from '#shared/types/notification'
import {
  NOTIFICATION_DEFAULT_TIME_ZONE,
  NOTIFICATION_LOCALES,
  NOTIFICATION_PROVIDERS,
  notificationProviderIcon
} from '#shared/utils/notification'
import { notificationChannelFormSchema } from '#shared/utils/validation'

const props = defineProps<{
  /** Omit to create a new channel. */
  channel?: NotificationChannel | null
}>()

const emit = defineEmits<{ saved: [channel: NotificationChannel] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()

interface ChannelFormState {
  name: string
  provider: NotificationProviderId
  enabled: boolean
  language: NotificationLocale
  config: Record<string, unknown>
}

const EMAIL_DEFAULTS = {
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromName: '',
  fromAddress: '',
  to: [] as string[],
  replyTo: '',
  rejectUnauthorized: true,
  timezone: NOTIFICATION_DEFAULT_TIME_ZONE
}

const TEAMS_DEFAULTS = { workflowUrl: '', format: 'card', timezone: NOTIFICATION_DEFAULT_TIME_ZONE }

function defaultsFor(provider: NotificationProviderId): Record<string, unknown> {
  return provider === 'teams' ? { ...TEAMS_DEFAULTS } : { ...EMAIL_DEFAULTS }
}

function createState(channel?: NotificationChannel | null): ChannelFormState {
  const provider = channel?.provider ?? 'email'

  return {
    name: channel?.name ?? '',
    provider,
    enabled: channel?.enabled ?? true,
    language: channel?.language ?? 'en',
    // The stored config never carries the secrets, so the defaults fill the gaps
    // and a blank secret field stays blank.
    config: { ...defaultsFor(provider), ...(channel?.config ?? {}) }
  }
}

const state = ref<ChannelFormState>(createState(props.channel))
const submitting = ref(false)
const testing = ref(false)
const tested = ref(false)

// The modal stays mounted, so the form is reset whenever it opens.
watch(open, (isOpen) => {
  if (isOpen) {
    state.value = createState(props.channel)
    tested.value = false
  }
})

const isEdit = computed(() => Boolean(props.channel))
const isEmail = computed(() => state.value.provider === 'email')

/** Secrets already stored, which the form is allowed to leave blank. */
const storedSecrets = computed(() =>
  props.channel && props.channel.provider === state.value.provider ? props.channel.secretsSet : []
)

const schema = computed(() => notificationChannelFormSchema(storedSecrets.value))

const providerItems = computed(() => NOTIFICATION_PROVIDERS.map(value => ({
  label: t(`notification.provider.${value}`),
  value,
  icon: notificationProviderIcon(value)
})))

const languageItems = computed(() => NOTIFICATION_LOCALES.map(value => ({
  label: t(`notification.language.${value}`),
  value
})))

const teamsFormatItems = computed(() => (['card', 'message', 'modern'] as const).map(value => ({
  label: t(`notification.form.teams.format.${value}`),
  value,
  description: t(`notification.form.teams.formatHint.${value}`)
})))

/** The card resolves times per viewer, so the zone only applies to messages. */
const showsTeamsTimezone = computed(() => state.value.config.format !== 'card')

// Switching the transport throws the old settings away: they mean nothing to the
// new one, and keeping them would submit fields it never validates.
watch(() => state.value.provider, (provider) => {
  state.value.config = { ...defaultsFor(provider), ...(props.channel?.provider === provider ? props.channel.config : {}) }
  tested.value = false
})

/** Recipients are edited as one line and stored as a list. */
const recipients = computed({
  get: () => ((state.value.config.to as string[] | undefined) ?? []).join(', '),
  set: (value: string) => {
    state.value.config.to = value.split(',').map(entry => entry.trim()).filter(Boolean)
  }
})

function secretPlaceholder(key: string): string {
  return storedSecrets.value.includes(key) ? t('notification.form.secretStored') : ''
}

async function onTest() {
  testing.value = true
  tested.value = false

  try {
    await $fetch('/api/notifications/channels/test', {
      method: 'POST',
      body: { ...state.value, id: props.channel?.id ?? null }
    })

    tested.value = true
    toast.add({ title: t('notification.test.success'), color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({
      title: t('notification.test.failed'),
      description: resolveErrorMessage(error),
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    testing.value = false
  }
}

async function onSubmit(event: FormSubmitEvent<ChannelFormState>) {
  submitting.value = true

  try {
    const saved = await $fetch<NotificationChannel>(
      isEdit.value ? `/api/notifications/channels/${props.channel!.id}` : '/api/notifications/channels',
      { method: isEdit.value ? 'PATCH' : 'POST', body: event.data }
    )

    toast.add({
      title: t(isEdit.value ? 'notification.channels.updated' : 'notification.channels.created', { name: saved.name }),
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
    :title="$t(isEdit ? 'notification.channels.edit' : 'notification.channels.create')"
    :description="$t('notification.channels.formDescription')"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <UForm
        id="notification-channel-form"
        :schema="schema"
        :state="state"
        class="space-y-6"
        @submit="onSubmit"
      >
        <section class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('notification.form.name')"
              name="name"
              required
            >
              <UInput
                v-model="state.name"
                class="w-full"
                :placeholder="$t('notification.form.namePlaceholder')"
                autofocus
              />
            </UFormField>

            <UFormField
              :label="$t('notification.form.provider')"
              name="provider"
              required
            >
              <USelectMenu
                v-model="state.provider"
                :items="providerItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('notification.form.language')"
              name="language"
              :description="$t('notification.form.languageHint')"
            >
              <USelectMenu
                v-model="state.language"
                :items="languageItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="$t('notification.form.enabled')"
              name="enabled"
              :description="$t('notification.form.enabledHint')"
            >
              <USwitch v-model="state.enabled" />
            </UFormField>
          </div>
        </section>

        <!-- SMTP -->
        <section
          v-if="isEmail"
          class="space-y-4"
        >
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('notification.form.smtp.title') }}
          </h3>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              class="sm:col-span-2"
              :label="$t('notification.form.smtp.host')"
              name="config.host"
              required
            >
              <UInput
                v-model="state.config.host as string"
                class="w-full"
                placeholder="smtp.example.com"
              />
            </UFormField>

            <UFormField
              :label="$t('notification.form.smtp.port')"
              name="config.port"
            >
              <UInputNumber
                v-model="state.config.port as number"
                class="w-full"
                :min="1"
                :max="65535"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('notification.form.smtp.username')"
              name="config.username"
              :hint="$t('common.optional')"
            >
              <UInput
                v-model="state.config.username as string"
                class="w-full"
                autocomplete="off"
              />
            </UFormField>

            <UFormField
              :label="$t('notification.form.smtp.password')"
              name="config.password"
              :hint="$t('common.optional')"
            >
              <AppPasswordInput
                v-model="state.config.password as string"
                class="w-full"
                autocomplete="new-password"
                :placeholder="secretPlaceholder('password')"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('notification.form.smtp.secure')"
              name="config.secure"
              :description="$t('notification.form.smtp.secureHint')"
            >
              <USwitch v-model="state.config.secure as boolean" />
            </UFormField>

            <UFormField
              :label="$t('notification.form.smtp.rejectUnauthorized')"
              name="config.rejectUnauthorized"
              :description="$t('notification.form.smtp.rejectUnauthorizedHint')"
            >
              <USwitch v-model="state.config.rejectUnauthorized as boolean" />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('notification.form.smtp.fromName')"
              name="config.fromName"
              :hint="$t('common.optional')"
            >
              <UInput
                v-model="state.config.fromName as string"
                class="w-full"
                placeholder="Uptime"
              />
            </UFormField>

            <UFormField
              :label="$t('notification.form.smtp.fromAddress')"
              name="config.fromAddress"
              required
            >
              <UInput
                v-model="state.config.fromAddress as string"
                class="w-full"
                placeholder="uptime@example.com"
              />
            </UFormField>
          </div>

          <UFormField
            :label="$t('notification.form.smtp.to')"
            name="config.to"
            :description="$t('notification.form.smtp.toHint')"
            required
          >
            <UInput
              v-model="recipients"
              class="w-full"
              placeholder="ops@example.com, oncall@example.com"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="$t('notification.form.smtp.replyTo')"
              name="config.replyTo"
              :hint="$t('common.optional')"
            >
              <UInput
                v-model="state.config.replyTo as string"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="$t('notification.form.smtp.timezone')"
              name="config.timezone"
              :description="$t('notification.form.smtp.timezoneHint')"
            >
              <UInput
                v-model="state.config.timezone as string"
                class="w-full"
                placeholder="Europe/Berlin"
              />
            </UFormField>
          </div>
        </section>

        <!-- Microsoft Teams -->
        <section
          v-else
          class="space-y-4"
        >
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('notification.form.teams.title') }}
          </h3>

          <UFormField
            :label="$t('notification.form.teams.workflowUrl')"
            name="config.workflowUrl"
            :description="$t('notification.form.teams.workflowUrlHint')"
            :required="!storedSecrets.includes('workflowUrl')"
          >
            <UInput
              v-model="state.config.workflowUrl as string"
              class="w-full"
              :placeholder="secretPlaceholder('workflowUrl') || 'https://prod-00.westeurope.logic.azure.com/workflows/…'"
            />
          </UFormField>

          <UFormField
            :label="$t('notification.form.teams.formatLabel')"
            name="config.format"
            :description="$t('notification.form.teams.formatDescription')"
          >
            <URadioGroup
              v-model="state.config.format as string"
              :items="teamsFormatItems"
              variant="table"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="showsTeamsTimezone"
            :label="$t('notification.form.smtp.timezone')"
            name="config.timezone"
            :description="$t('notification.form.teams.timezoneHint')"
          >
            <UInput
              v-model="state.config.timezone as string"
              class="w-full"
              placeholder="Europe/Berlin"
            />
          </UFormField>

          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="$t('notification.form.teams.setupTitle')"
            :description="$t('notification.form.teams.setupDescription')"
          />
        </section>
      </UForm>
    </template>

    <template #footer>
      <div class="flex flex-col-reverse gap-2 w-full sm:flex-row sm:items-center sm:justify-between">
        <UButton
          color="neutral"
          variant="subtle"
          :disabled="testing"
          :label="$t('notification.test.button')"
          @click="onTest"
        >
          <template #leading>
            <!-- One control that stays mounted through send, success and back,
                 which is what the morph is for. -->
            <AppMorphIcon
              :name="testing ? 'loaderCircle' : tested ? 'check' : 'send'"
              class="size-5 shrink-0"
              :class="testing ? 'animate-spin' : ''"
            />
          </template>
        </UButton>

        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="$t('common.cancel')"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="notification-channel-form"
            :loading="submitting"
            :label="$t(isEdit ? 'common.save' : 'common.create')"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
