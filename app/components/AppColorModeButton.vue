<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const colorMode = useColorMode()
const mounted = ref(false)

onMounted(() => {
  mounted.value = true
})

const isDark = computed({
  // The effective mode is client-only. Keep the hydration render stable, then
  // let the icon adopt the real mode once Vue owns the DOM.
  get: () => mounted.value && colorMode.value === 'dark',
  set: (value: boolean) => {
    colorMode.preference = value ? 'dark' : 'light'
  }
})

const label = computed(() => t(isDark.value ? 'common.switchToLightMode' : 'common.switchToDarkMode'))
</script>

<template>
  <UButton
    v-bind="$attrs"
    color="neutral"
    variant="ghost"
    :aria-label="label"
    @click="isDark = !isDark"
  >
    <template #leading>
      <AppMorphIcon
        :name="isDark ? 'moon' : 'sun'"
        class="size-5"
      />
    </template>
  </UButton>
</template>
