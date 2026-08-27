<script setup lang="ts">
import type { Component } from 'vue'
import type { DashboardWidget, WidgetType } from '#shared/types/dashboard'
import type { MonitorWithState } from '#shared/types/monitor'
import CertificateExpiry from './widget/CertificateExpiry.vue'
import Heading from './widget/Heading.vue'
import IncidentFeed from './widget/IncidentFeed.vue'
import IncidentHistory from './widget/IncidentHistory.vue'
import LatencyChart from './widget/LatencyChart.vue'
import Monitor from './widget/Monitor.vue'
import MonitorList from './widget/MonitorList.vue'
import ReliabilityKpis from './widget/ReliabilityKpis.vue'
import SlaTable from './widget/SlaTable.vue'
import StatusOverview from './widget/StatusOverview.vue'
import UptimeCalendar from './widget/UptimeCalendar.vue'
import UptimeSummary from './widget/UptimeSummary.vue'

/**
 * The one place a widget type is turned into a component. Imported rather than
 * auto-imported, because a map needs the components as values and Nuxt resolves
 * its own only per call site.
 *
 * Every widget takes the same two props, so the grid and the settings preview
 * can render any of them without knowing which one they got.
 */
const WIDGET_COMPONENTS: Record<WidgetType, Component> = {
  'monitor': Monitor,
  'uptime-summary': UptimeSummary,
  'latency-chart': LatencyChart,
  'uptime-calendar': UptimeCalendar,
  'status-overview': StatusOverview,
  'monitor-list': MonitorList,
  'incident-feed': IncidentFeed,
  'certificate-expiry': CertificateExpiry,
  'sla-table': SlaTable,
  'incident-history': IncidentHistory,
  'reliability-kpis': ReliabilityKpis,
  'heading': Heading
}

const props = defineProps<{
  widget: DashboardWidget
  monitors: MonitorWithState[]
}>()

const component = computed(() => WIDGET_COMPONENTS[props.widget.type])
</script>

<template>
  <component
    :is="component"
    :widget="widget"
    :monitors="monitors"
  />
</template>
