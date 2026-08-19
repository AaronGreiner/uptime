import { setValidationTranslator } from '#shared/utils/validation'

/**
 * Routes zod validation messages through vue-i18n. The translator is resolved
 * lazily on every call, so switching the language updates errors already shown.
 */
export default defineNuxtPlugin((nuxtApp) => {
  setValidationTranslator((key, params) => {
    const i18n = nuxtApp.$i18n as { t: (key: string, params?: Record<string, unknown>) => string } | undefined

    return i18n ? i18n.t(key, params ?? {}) : key
  })
})
