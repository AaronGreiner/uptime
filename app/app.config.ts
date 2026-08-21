export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'zinc'
    },
    card: {
      slots: {
        // `overflow-hidden` on the card disables the automatic minimum size, so
        // without this a card would be squashed inside the panel's flex column.
        root: 'transition-colors shrink-0'
      }
    },
    dashboardPanel: {
      slots: {
        /*
         * The content area floats as an inset surface instead of being divided
         * from the sidebar by a hard line. `min-h-0` replaces the theme's
         * `min-h-svh`, which would otherwise push the panel past the viewport
         * once the margin is added.
         */
        root: 'min-h-0 m-2 sm:m-4 rounded-xl border border-default bg-elevated/40 overflow-hidden',
        // The panel margin already provides breathing room, so the inner padding
        // is a touch tighter than the default to give the content its width back.
        body: 'p-3 sm:p-5 gap-5 sm:gap-6'
      }
    }
  }
})
