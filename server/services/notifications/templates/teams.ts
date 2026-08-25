import type { NotificationEvent, NotificationLocale } from '../../../../shared/types/notification'
import { eventFacts, eventSummary, eventTitle, monitorUrl, toIsoSeconds, toneFor } from '../format'
import type { NotificationTone, Translate } from '../format'

/**
 * Adaptive cards only accept these named styles — there is no place to put a
 * brand hex value, so the palette is whatever Teams makes of the four.
 */
const TONE_STYLES: Record<NotificationTone, { container: string, text: string }> = {
  down: { container: 'attention', text: 'Attention' },
  up: { container: 'good', text: 'Good' },
  warning: { container: 'warning', text: 'Warning' }
}

export interface TeamsRenderOptions {
  language: NotificationLocale
  channelName: string
  timeZone: string
  appName: string
  t: Translate
}

/**
 * Builds the message posted to a Power Automate workflow webhook.
 *
 * Two details exist purely for the preview. The card opens with a plain
 * `TextBlock` rather than a container, because the channel list, the activity
 * feed and the mobile push read the card's leading text — a card that starts
 * with a styled container shows up as "sent a card" and tells nobody anything.
 * The envelope carries `summary` for the same reason.
 *
 * Everything here is pure, so swapping the shape for one of the fallbacks is a
 * change in one place.
 */
export function buildTeamsPayload(event: NotificationEvent, options: TeamsRenderOptions): Record<string, unknown> {
  const { t, language, timeZone } = options
  const tone = TONE_STYLES[toneFor(event)]
  const title = eventTitle(event, t)
  const summary = eventSummary(event, t)
  const link = monitorUrl(event.monitor.id)

  // Teams renders these for whoever opens the card, in their own time zone.
  const facts = eventFacts(event, t, {
    locale: language,
    timeZone,
    renderTimestamp: seconds => `{{DATE(${toIsoSeconds(seconds)}, SHORT)}} {{TIME(${toIsoSeconds(seconds)})}}`,
    renderDate: seconds => `{{DATE(${toIsoSeconds(seconds)}, SHORT)}}`
  })

  const body: Record<string, unknown>[] = [
    {
      type: 'TextBlock',
      text: title,
      size: 'Large',
      weight: 'Bolder',
      color: tone.text,
      wrap: true
    },
    {
      type: 'TextBlock',
      text: summary,
      isSubtle: true,
      wrap: true,
      spacing: 'Small'
    },
    {
      type: 'Container',
      style: tone.container,
      bleed: false,
      spacing: 'Medium',
      items: [{
        type: 'FactSet',
        facts: facts.map(fact => ({ title: fact.label, value: fact.value }))
      }]
    },
    {
      type: 'TextBlock',
      text: t('notification.footer', { app: options.appName, channel: options.channelName }),
      size: 'Small',
      isSubtle: true,
      wrap: true,
      spacing: 'Medium'
    }
  ]

  const actions = link
    ? [{ type: 'Action.OpenUrl', title: t('notification.action.openMonitor'), url: link }]
    : []

  return {
    type: 'message',
    summary: title,
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        msteams: { width: 'Full' },
        body,
        actions
      }
    }]
  }
}
