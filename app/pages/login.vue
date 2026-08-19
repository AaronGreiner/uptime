<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema } from '#shared/utils/validation'
import type { z } from 'zod'

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { fetch: refreshSession, loggedIn } = useUserSession()

definePageMeta({ layout: 'default' })

useSeoMeta({ title: () => t('auth.signInTitle') })

const state = reactive({ username: '', password: '' })
const submitting = ref(false)
const failed = ref(false)

watchEffect(() => {
  if (loggedIn.value) {
    navigateTo(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  }
})

async function onSubmit(event: FormSubmitEvent<z.output<typeof loginSchema>>) {
  submitting.value = true
  failed.value = false

  try {
    const { user } = await $fetch('/api/auth/login', { method: 'POST', body: event.data })

    await refreshSession()

    toast.add({ title: t('auth.signedIn', { username: user.username }), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch {
    failed.value = true
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-16 sm:py-24">
    <div class="mx-auto w-full max-w-sm">
      <UCard>
        <div class="space-y-6">
          <div class="space-y-1.5">
            <h1 class="text-xl font-semibold text-highlighted">
              {{ $t('auth.signInTitle') }}
            </h1>
            <p class="text-sm text-muted">
              {{ $t('auth.signInDescription') }}
            </p>
          </div>

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
    </div>
  </UContainer>
</template>
