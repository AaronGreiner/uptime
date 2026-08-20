import type { ReducedMotionMode } from 'morphicons/vue'

export type MorphMotion = 'system' | 'on' | 'off'

export function isMorphMotion(value: unknown): value is MorphMotion {
  return value === 'system' || value === 'on' || value === 'off'
}

/** Stores the icon-motion preference and translates it to morphicons policy. */
export function useMorphMotion() {
  const morphMotion = useUiPreference<MorphMotion>('morph-motion', () => 'system', isMorphMotion)

  const reducedMotion = computed<ReducedMotionMode>(() => {
    switch (morphMotion.value) {
      case 'system': return 'user'
      case 'on': return 'never'
      case 'off': return 'always'
    }
  })

  return { morphMotion, reducedMotion }
}
