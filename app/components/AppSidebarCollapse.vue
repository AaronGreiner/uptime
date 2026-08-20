<script setup lang="ts">
import { useDashboard as useDashboardContext } from '@nuxt/ui/utils/dashboard'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const { sidebarCollapsed, collapseSidebar } = useDashboardContext()

const collapsed = computed(() => sidebarCollapsed?.value ?? false)
const label = computed(() => t(collapsed.value ? 'nav.expandSidebar' : 'nav.collapseSidebar'))

function toggle() {
  collapseSidebar?.(!collapsed.value)
}
</script>

<template>
  <UButton
    v-bind="$attrs"
    color="neutral"
    variant="ghost"
    class="hidden lg:flex"
    :aria-label="label"
    @click="toggle"
  >
    <template #leading="{ ui }">
      <AppMorphIcon
        :name="collapsed ? 'arrowRightToLine' : 'arrowLeftToLine'"
        spring="smooth"
        :class="ui.leadingIcon()"
      />
    </template>
  </UButton>
</template>
