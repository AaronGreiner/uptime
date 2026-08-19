<template>
  <UCard
    variant="soft"
    class="h-full"
    :ui="{ root: 'flex', body: 'flex-1 grid place-items-center' }"
  >
    <p class="flex items-center gap-2 text-sm text-dimmed">
      <UIcon
        name="i-lucide-unlink"
        class="size-4"
      />
      {{ $t('widget.monitorMissing') }}
    </p>
  </UCard>
</template>
