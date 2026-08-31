import { addCollection } from '@iconify/vue'
import lucide from '@iconify-json/lucide/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'

let registered = false

/**
 * Register local geometry once for SSR. The provider's native fetch cannot
 * resolve relative icon URLs under Bun. Keeping this server-only also means
 * the browser receives CSS only for icons actually rendered on the page.
 */
export default defineNuxtPlugin({
  name: 'local-icon-collections',
  dependsOn: ['@nuxt/icon'],
  setup() {
    if (registered) return

    addCollection(lucide)
    addCollection(simpleIcons)
    registered = true
  }
})
