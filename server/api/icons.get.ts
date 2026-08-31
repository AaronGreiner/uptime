import lucide from '@iconify-json/lucide/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'
import type { IconCatalog } from '../../shared/utils/icon'

// Ship names only, on demand. Geometry stays in Nuxt Icon's local server bundle.
const catalog: IconCatalog = {
  'lucide': Object.keys(lucide.icons).sort(),
  'simple-icons': Object.keys(simpleIcons.icons).sort()
}

export default defineEventHandler(() => catalog)
