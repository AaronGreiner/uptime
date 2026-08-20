<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const { t } = useI18n()

const {
  entries,
  collapsedItems,
  hasFoldableGroups,
  allCollapsed,
  toggle,
  toggleAll
} = useMonitorNavigation()

/** One button for both directions, naming whichever is left to do. */
const foldAllLabel = computed(() => t(allCollapsed.value ? 'nav.expandAll' : 'nav.collapseAll'))
</script>

<template>
  <!--
    Collapsed to icons the tree cannot be folded, so that mode hands the items
    to `UNavigationMenu` and lets it render the popovers.
  -->
  <UNavigationMenu
    v-if="collapsed"
    :items="collapsedItems"
    collapsed
    orientation="vertical"
    tooltip
    popover
  />

  <div v-else>
    <div class="w-full flex items-center gap-1.5 font-semibold text-xs/5 text-highlighted px-2.5 py-1.5">
      <span class="truncate-target">{{ $t('nav.monitoring') }}</span>

      <UTooltip
        v-if="hasFoldableGroups"
        :text="foldAllLabel"
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          square
          class="ms-auto"
          :aria-label="foldAllLabel"
          @click="toggleAll"
        >
          <template #leading="{ ui }">
            <AppMorphIcon
              :name="allCollapsed ? 'chevronsUpDown' : 'chevronsDownUp'"
              :class="ui.leadingIcon()"
            />
          </template>
        </UButton>
      </UTooltip>
    </div>

    <AppMonitorNavList
      :entries="entries"
      :toggle="toggle"
    />
  </div>
</template>
