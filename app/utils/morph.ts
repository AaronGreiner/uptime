import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Copy,
  Eye,
  EyeOff,
  FolderTree,
  LayoutGrid,
  LoaderCircle,
  Moon,
  Pause,
  PencilRuler,
  Play,
  RefreshCw,
  Send,
  Sun,
  Wrench
} from 'lucide'
import type { IconNode } from 'morphicons/vue'
import type { MonitorDisplayStatus } from '#shared/types/monitor'

/**
 * The icons that take part in a morph. Module scope is intentional: morphicons
 * caches its plans in a WeakMap keyed by the IconNode reference.
 */
export const MORPH_ICONS = {
  arrowLeftToLine: ArrowLeftToLine,
  arrowRightToLine: ArrowRightToLine,
  check: Check,
  chevronsDownUp: ChevronsDownUp,
  chevronsUpDown: ChevronsUpDown,
  circleCheck: CircleCheck,
  circleDashed: CircleDashed,
  circlePause: CirclePause,
  circleX: CircleX,
  copy: Copy,
  eye: Eye,
  eyeOff: EyeOff,
  folderTree: FolderTree,
  layoutGrid: LayoutGrid,
  loaderCircle: LoaderCircle,
  moon: Moon,
  pause: Pause,
  pencilRuler: PencilRuler,
  play: Play,
  refreshCw: RefreshCw,
  send: Send,
  sun: Sun,
  wrench: Wrench
} satisfies Record<string, IconNode>

export type MorphIconName = keyof typeof MORPH_ICONS

/**
 * Morph counterpart of `monitorStatusIcon` in shared/utils/monitor.ts.
 * Kept here rather than there because `shared/` is imported by the server, and
 * the icon geometry has no business in the Nitro bundle.
 */
export function monitorStatusMorphIcon(status: MonitorDisplayStatus): MorphIconName {
  switch (status) {
    case 'up': return 'circleCheck'
    case 'down': return 'circleX'
    case 'pending': return 'loaderCircle'
    case 'paused': return 'circlePause'
    case 'maintenance': return 'wrench'
    case 'unknown': return 'circleDashed'
  }
}
