import type { InjectionKey } from 'vue'

const WIDGET_EDITING = Symbol('widget-editing') as InjectionKey<ComputedRef<boolean>>

/**
 * Whether the widget below is being arranged rather than read — true while a
 * dashboard is in edit mode, and inside the settings preview.
 *
 * Provided rather than passed down: every widget takes the same two props, which
 * is what lets the grid and the preview render any of them without a branch, and
 * one widget wanting to know is not a reason to widen that contract. A widget
 * that offers the reader a control uses it to step out of the way of the resize
 * and drag buttons the edit mode puts in the same corner.
 */
export function provideWidgetEditing(editing: () => boolean) {
  provide(WIDGET_EDITING, computed(editing))
}

export function useWidgetEditing() {
  return inject(WIDGET_EDITING, computed(() => false))
}
