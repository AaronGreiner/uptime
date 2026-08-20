<script setup lang="ts">
const model = defineModel<string>({ required: true })

const { t } = useI18n()
const visible = ref(false)
const label = computed(() => t(visible.value ? 'auth.hidePassword' : 'auth.showPassword'))

function toggleVisibility() {
  visible.value = !visible.value
}
</script>

<template>
  <UInput
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="label"
        :aria-pressed="visible"
        @mousedown.prevent
        @click="toggleVisibility"
      >
        <template #leading>
          <AppMorphIcon
            :name="visible ? 'eyeOff' : 'eye'"
            class="size-4"
          />
        </template>
      </UButton>
    </template>
  </UInput>
</template>
