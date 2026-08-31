import type { Dashboard } from '../types/dashboard'
import { isCustomIcon } from './icon'

/** A custom icon wins; existing dashboards retain their default-page marker. */
export function dashboardIcon(dashboard: Pick<Dashboard, 'icon' | 'isDefault'>): string {
  return isCustomIcon(dashboard.icon)
    ? dashboard.icon
    : dashboard.isDefault ? 'i-lucide-layout-dashboard' : 'i-lucide-layout-panel-left'
}
