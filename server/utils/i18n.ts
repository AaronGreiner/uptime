import type { NotificationLocale } from '../../shared/types/notification'
import de from '../../i18n/locales/de.json'
import en from '../../i18n/locales/en.json'

const DEFAULT_LOCALE: NotificationLocale = 'en'

const catalogues: Record<NotificationLocale, unknown> = { en, de }

export type TranslationParams = Record<string, string | number>

/**
 * Translator for text rendered outside the browser.
 *
 * Notification subjects and card labels are display text and must not be
 * hardcoded, but there is no vue-i18n on this side and no browser locale to read
 * — the language comes from the channel. Only `{param}` interpolation is
 * supported, which is all the notification templates use; vue-i18n's linked
 * messages and plural forms are not.
 */
export function translate(locale: NotificationLocale, key: string, params?: TranslationParams): string {
  const message = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key)

  if (message === undefined) {
    console.warn(`[i18n] missing translation for "${key}"`)

    return key
  }

  return interpolate(message, params)
}

/** Binds a locale once, so a template reads `t('…')` like everywhere else. */
export function translator(locale: NotificationLocale) {
  return (key: string, params?: TranslationParams) => translate(locale, key, params)
}

function lookup(locale: NotificationLocale, key: string): string | undefined {
  let current: unknown = catalogues[locale]

  for (const segment of key.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' ? current : undefined
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template
  }

  return Object.entries(params).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template
  )
}
