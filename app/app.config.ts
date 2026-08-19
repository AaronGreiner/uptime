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
    }
  }
})
