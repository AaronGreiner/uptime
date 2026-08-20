<script setup lang="ts">
const appName = useRuntimeConfig().public.appName
</script>

<template>
  <div class="min-h-svh flex flex-col bg-default">
    <header class="h-(--ui-header-height) flex items-center justify-between px-4 sm:px-6 border-b border-default">
      <NuxtLink
        to="/"
        class="flex items-center gap-2 font-semibold text-highlighted"
      >
        <AppLogo class="size-7 shrink-0" />
        <span>{{ appName }}</span>
      </NuxtLink>

      <div class="flex items-center gap-1">
        <AppLocaleSelect />
        <AppColorModeButton />
      </div>
    </header>

    <main class="flex-1 grid place-items-center p-4">
      <slot />
    </main>
  </div>
</template>
