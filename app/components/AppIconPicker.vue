<script setup lang="ts">
import type { IconCatalog, IconCollection } from '#shared/utils/icon'
import { ICON_COLLECTIONS, customIconCollection, customIconName } from '#shared/utils/icon'

defineProps<{ fallbackIcon: string }>()
const model = defineModel<string | null>({ required: true })
const { t, n } = useI18n()
const open = ref(false)
const draft = ref<string | null>(null)
const search = ref('')
const collection = ref<IconCollection | 'all'>('all')

// Forms share the names, but mounting a closed form never fetches the catalog.
// Nuxt Icon separately loads only the geometry visible in the virtual grid.
const { data: catalog, status, error, execute } = useAsyncData<IconCatalog>(
  'icon-catalog',
  () => $fetch('/api/icons'),
  { immediate: false, server: false }
)

const { data: used, status: usedStatus, error: usedError, execute: loadUsed } = useAsyncData<string[]>(
  'used-icons',
  () => $fetch('/api/icons/used'),
  { immediate: false, server: false }
)

watch(open, (value) => {
  if (!value) return

  draft.value = model.value
  search.value = ''
  collection.value = 'all'

  if (!catalog.value && status.value !== 'pending') {
    void execute()
  }

  void loadUsed()
})

const collectionItems = computed(() => [
  { value: 'all' as const, label: t('iconPicker.allCollections') },
  ...ICON_COLLECTIONS.map(value => ({ value, label: t(`iconPicker.collection.${value}`) }))
])

function label(icon: string): string {
  return t('iconPicker.namedIcon', {
    name: customIconName(icon),
    collection: t(`iconPicker.collection.${customIconCollection(icon)}`)
  })
}

const items = computed(() => ICON_COLLECTIONS.flatMap(library => (
  catalog.value?.[library] ?? []
).map(name => `i-${library}-${name}`)))

const query = computed(() => search.value.trim().toLowerCase().replace(/-/g, ' '))

function matches(icon: string): boolean {
  return (collection.value === 'all' || customIconCollection(icon) === collection.value)
    && query.value.split(/\s+/).every(word => customIconName(icon).includes(word))
}

const results = computed(() => items.value.filter(matches))
const usedResults = computed(() => (used.value ?? []).filter(matches))

function apply() {
  model.value = draft.value
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t('iconPicker.title')"
    :description="$t('iconPicker.hint')"
    :ui="{
      content: 'max-w-3xl h-[44rem]',
      body: 'p-0 sm:p-0 flex flex-col min-h-0 overflow-hidden',
      footer: 'p-4 sm:p-5'
    }"
  >
    <UButton
      type="button"
      color="neutral"
      variant="outline"
      class="w-full justify-start"
      :aria-label="$t('iconPicker.choose')"
    >
      <template #leading="{ ui }">
        <UIcon
          :key="model ?? fallbackIcon"
          :name="model ?? fallbackIcon"
          :class="ui.leadingIcon()"
        />
      </template>
      <span class="flex-1 truncate text-start">{{ model ? label(model) : $t('iconPicker.default') }}</span>
      <UIcon
        name="i-lucide-grid-2x2"
        class="size-4 shrink-0 text-muted"
      />
    </UButton>

    <template #body>
      <div class="shrink-0 space-y-3 border-b border-default p-4 sm:px-5">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="$t('iconPicker.search')"
            :aria-label="$t('iconPicker.search')"
            class="flex-1"
            autofocus
          />
          <USelect
            v-model="collection"
            :items="collectionItems"
            :aria-label="$t('iconPicker.collections')"
            class="sm:w-44"
          />
        </div>
        <div class="flex items-center justify-between gap-3">
          <UButton
            type="button"
            :icon="fallbackIcon"
            :color="draft === null ? 'primary' : 'neutral'"
            :variant="draft === null ? 'soft' : 'ghost'"
            size="xs"
            :label="$t('iconPicker.default')"
            :aria-pressed="draft === null"
            @click="draft = null"
          />
          <span
            class="text-xs text-muted tabular-nums"
            role="status"
          >{{ $t('iconPicker.count', { count: n(results.length) }) }}</span>
        </div>
      </div>

      <section class="shrink-0 border-b border-default px-4 py-3 sm:px-5">
        <h3 class="mb-2 text-xs font-medium text-muted">
          {{ $t('iconPicker.used') }}
        </h3>
        <div
          v-if="usedError"
          class="flex items-center justify-between gap-2"
        >
          <p
            class="text-xs text-error"
            role="alert"
          >
            {{ $t('iconPicker.usedError') }}
          </p>
          <UButton
            type="button"
            size="xs"
            variant="ghost"
            :label="$t('common.retry')"
            @click="loadUsed()"
          />
        </div>
        <AppIconGrid
          v-else-if="usedResults.length"
          :key="`${collection}-${query}`"
          v-model="draft"
          :icons="usedResults"
          :label="$t('iconPicker.used')"
          :max-rows="2"
        />
        <p
          v-else
          class="text-xs text-dimmed"
        >
          {{ $t(usedStatus === 'pending' ? 'common.loading' : used?.length ? 'iconPicker.empty' : 'iconPicker.usedEmpty') }}
        </p>
      </section>

      <div class="flex-1 min-h-0 m-3 sm:m-4">
        <div
          v-if="status === 'pending' && !catalog"
          class="h-full flex items-center justify-center gap-2 text-muted"
          role="status"
        >
          <AppMorphIcon
            name="loaderCircle"
            class="size-5 animate-spin"
          />
          {{ $t('common.loading') }}
        </div>
        <div
          v-else-if="error"
          class="h-full flex flex-col items-center justify-center gap-3"
          role="alert"
        >
          <p class="text-sm text-error">
            {{ $t('iconPicker.loadError') }}
          </p>
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            :label="$t('common.retry')"
            @click="execute()"
          />
        </div>
        <p
          v-else-if="!results.length"
          class="h-full flex items-center justify-center text-sm text-muted"
        >
          {{ $t('iconPicker.empty') }}
        </p>
        <AppIconGrid
          v-else
          :key="`${collection}-${query}`"
          v-model="draft"
          :icons="results"
          :label="$t('iconPicker.results')"
        />
      </div>
    </template>

    <template #footer>
      <div class="w-full flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          class="flex min-w-0 items-center gap-3"
          aria-live="polite"
        >
          <div class="size-14 shrink-0 rounded-xl bg-elevated flex items-center justify-center">
            <UIcon
              :key="draft ?? fallbackIcon"
              :name="draft ?? fallbackIcon"
              class="size-9 text-highlighted"
            />
          </div>
          <div class="min-w-0">
            <p class="text-xs text-muted">
              {{ $t('iconPicker.preview') }}
            </p>
            <p class="truncate text-sm font-medium text-highlighted">
              {{ draft ? label(draft) : $t('iconPicker.default') }}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            :label="$t('common.cancel')"
            @click="open = false"
          />
          <UButton
            type="button"
            :label="$t('iconPicker.apply')"
            @click="apply()"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
