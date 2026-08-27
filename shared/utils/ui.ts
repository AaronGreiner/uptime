/**
 * How long a stored interface preference survives. Roughly a year, long enough
 * that a setting is never silently forgotten.
 *
 * Lives here rather than next to `useUiPreference` because `nuxt.config.ts`
 * needs it too, for the cookie the colour mode is stored in.
 */
export const UI_PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
