<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema } from '#shared/utils/validation'
import type { z } from 'zod'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { fetch: refreshSession, loggedIn } = useUserSession()

useSeoMeta({ title: () => t('auth.signInTitle') })

const state = reactive({ username: '', password: '' })
const submitting = ref(false)
const failed = ref(false)

const redirectTarget = computed(() => typeof route.query.redirect === 'string' ? route.query.redirect : '/')

watchEffect(() => {
  if (loggedIn.value) {
    navigateTo(redirectTarget.value)
  }
})

async function onSubmit(event: FormSubmitEvent<z.output<typeof loginSchema>>) {
  submitting.value = true
  failed.value = false

  try {
    const { user } = await $fetch('/api/auth/login', { method: 'POST', body: event.data })

    await refreshSession()

    toast.add({ title: t('auth.signedIn', { username: user.username }), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(redirectTarget.value)
  } catch {
    failed.value = true
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UCard
    class="w-full max-w-sm"
    :title="$t('auth.signInTitle')"
    :description="$t('auth.signInDescription')"
  >
    <div class="space-y-4">
      <UAlert
        v-if="failed"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="$t('auth.invalidCredentials')"
      />

      <UForm
        :schema="loginSchema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          :label="$t('auth.username')"
          name="username"
          required
        >
          <UInput
            v-model="state.username"
            class="w-full"
            autocomplete="username"
            autofocus
          />
        </UFormField>

        <UFormField
          :label="$t('auth.password')"
          name="password"
          required
        >
          <UInput
            v-model="state.password"
            class="w-full"
            type="password"
            autocomplete="current-password"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="submitting"
          :label="$t('auth.signIn')"
        />
      </UForm>
    </div>
  </UCard>
</template>
