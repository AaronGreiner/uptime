<script setup lang="ts">
import type { MonitorNavEntry } from '~/composables/useMonitorNavigation'

/**
 * One level of the monitoring tree, recursing into itself for the subgroups.
 * The fold state lives in `useMonitorNavigation`, so every level only reports
 * a click back through `toggle`.
 */
withDefaults(defineProps<{
  entries: MonitorNavEntry[]
  toggle: (groupId: number) => void
  /** Zero for the roots. Deeper levels are indented against a guide line. */
  level?: number
}>(), { level: 0 })
</script>

<template>
  <ul :class="level > 0 ? 'ms-5 border-s border-default' : undefined">
    <li
      v-for="entry in entries"
      :key="entry.key"
      :class="level > 0 ? 'ps-1.5 -ms-px' : undefined"
    >
      <div
        class="group flex items-center rounded-md transition-colors"
        :class="entry.active ? 'bg-elevated' : 'hover:bg-elevated/50'"
      >
        <!--
          Rendered as a plain anchor: the router marks every `/monitors?group=…`
          link as active on the bare list route, because it compares paths and
          ignores the query. `useMonitorNavigation` knows about exactly one
          current row, and this way nothing else can claim to be it.
        -->
        <NuxtLink
          v-slot="{ href, navigate, prefetch }"
          :to="entry.to"
          custom
        >
          <a
            :href="href"
            :aria-current="entry.active ? 'page' : undefined"
            class="min-w-0 flex-1 flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium transition-colors"
            :class="entry.active ? 'text-primary' : 'text-muted group-hover:text-highlighted'"
            @click="navigate"
            @pointerenter="prefetch()"
          >
            <!-- The chip turns the type icon into a status dot without costing a column. -->
            <UChip
              v-if="entry.status"
              :color="monitorStatusColor(entry.status)"
              size="sm"
              inset
            >
              <UIcon
                :name="entry.icon"
                class="size-5 shrink-0 transition-colors"
                :class="entry.active ? 'text-primary' : 'text-dimmed group-hover:text-default'"
              />
            </UChip>
            <UIcon
              v-else
              :name="entry.icon"
              class="size-5 shrink-0 transition-colors"
              :class="entry.active ? 'text-primary' : 'text-dimmed group-hover:text-default'"
            />

            <span class="truncate-target">{{ entry.label }}</span>

            <UBadge
              v-if="entry.badge"
              :color="entry.badge.color"
              :variant="entry.badge.variant"
              size="sm"
              class="ms-auto shrink-0"
            >
              {{ entry.badge.label }}
            </UBadge>
          </a>
        </NuxtLink>

        <UButton
          v-if="entry.groupId !== undefined && entry.children.length > 0"
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          class="me-1 shrink-0"
          :aria-expanded="entry.expanded"
          :aria-label="$t('nav.toggleGroup', { name: entry.label })"
          :ui="{ leadingIcon: ['transition-transform duration-200', entry.expanded ? 'rotate-180' : ''] }"
          @click="toggle(entry.groupId)"
        />
      </div>

      <!--
        The subtree stays mounted and is folded away by collapsing its grid row,
        which is what animates the height. `inert` keeps a hidden branch out of
        the tab order.
      -->
      <div
        v-if="entry.children.length > 0"
        class="grid transition-[grid-template-rows] duration-200"
        :class="entry.expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      >
        <div
          class="overflow-hidden"
          :inert="!entry.expanded"
        >
          <AppMonitorNavList
            :entries="entry.children"
            :toggle="toggle"
            :level="level + 1"
          />
        </div>
      </div>
    </li>
  </ul>
</template>
