/** Only the two locally installed collections may supply custom icons. */
export const ICON_COLLECTIONS = ['lucide', 'simple-icons'] as const
export type IconCollection = typeof ICON_COLLECTIONS[number]
export type IconCatalog = Record<IconCollection, string[]>

export function isCustomIcon(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 100
    && /^i-(?:lucide|simple-icons)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

/** Library identifiers are searchable data, not translated interface labels. */
export function customIconName(icon: string): string {
  return icon.replace(/^i-(?:lucide|simple-icons)-/, '').replace(/-/g, ' ')
}

export function customIconCollection(icon: string): IconCollection {
  return icon.startsWith('i-simple-icons-') ? 'simple-icons' : 'lucide'
}
