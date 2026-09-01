<script setup lang="ts">
import type { UplinkStatus } from '#shared/types/uplink'

const { data: uplink, refresh } = await useFetch<UplinkStatus>('/api/uplink', {
  default: () => ({ online: true, since: null, fault: null, checkedAt: null })
})

const { formatDuration } = useFormatters()
const now = useNow()
const minimized = ref(false)

const duration = computed(() => uplink.value.since === null
  ? ''
  : formatDuration(Math.max(0, Math.floor(now.value / 1000) - uplink.value.since)))

const stopLive = useLive().subscribe((event) => {
  if (event.type === 'uplink.changed') {
    uplink.value = event.uplink

    // A later outage is a new fact and should start expanded even if the reader
    // folded the previous one away.
    if (!event.uplink.online) {
      minimized.value = false
    }
  }
})

const stopResume = useLive().onResumed(() => {
  void refresh()
})

onScopeDispose(() => {
  stopLive()
  stopResume()
})
</script>

<template>
  <div
    v-if="!uplink.online"
    class="fixed z-50 top-3 end-3 max-w-[calc(100vw-1.5rem)]"
  >
    <UButton
      v-if="minimized"
      color="neutral"
      variant="subtle"
      size="sm"
      class="border border-default shadow-sm"
      :aria-label="$t('uplink.banner.expand')"
      @click="minimized = false"
    >
      <template #leading>
        <UIcon
          name="i-lucide-wifi-off"
          class="size-4 text-warning"
        />
      </template>
      <span class="tabular-nums">{{ duration }}</span>
      <template #trailing>
        <UIcon
          name="i-lucide-chevrons-up-down"
          class="size-3.5 text-dimmed"
        />
      </template>
    </UButton>

    <div
      v-else
      role="status"
      class="flex w-full max-w-sm items-start gap-3 rounded-lg border border-default bg-elevated/95 p-3 shadow-sm backdrop-blur"
    >
      <div class="grid size-8 shrink-0 place-items-center rounded-md bg-warning/10 text-warning">
        <UIcon
          name="i-lucide-wifi-off"
          class="size-4"
        />
      </div>

      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-highlighted">
          {{ $t('uplink.banner.title') }}
        </p>
        <p class="mt-0.5 text-xs/5 text-muted">
          {{ $t(`uplink.banner.${uplink.fault ?? 'network'}`, { duration }) }}
        </p>
      </div>

      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="$t('uplink.banner.minimize')"
        @click="minimized = true"
      >
        <UIcon
          name="i-lucide-chevrons-down-up"
          class="size-4"
        />
      </UButton>
    </div>
  </div>
</template>
