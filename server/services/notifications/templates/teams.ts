import type { NotificationEvent, NotificationLocale } from '../../../../shared/types/notification'
import {
  escapeHtml,
  eventFacts,
  eventLink,
  eventLinkLabel,
  eventSummary,
  eventTitle,
  toIsoSeconds,
  toneFor,
  toneMarker
} from '../format'
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
 * Picks the payload for the action the workflow behind the webhook actually
 * uses. The two are not interchangeable: `card` is read by "Post card in a chat
 * or channel", `message` by "Post message in a chat or channel".
 */
export function buildTeamsRequest(
  event: NotificationEvent,
  options: TeamsRenderOptions & { format: 'card' | 'message' }
): Record<string, unknown> {
  return options.format === 'message' ? buildTeamsMessage(event, options) : buildTeamsPayload(event, options)
}

/**
 * A plain Teams message rather than a card.
 *
 * The card action gives no preview text at all — the channel list and the
 * activity feed show "Card" or "Preview unavailable", whoever it is posted as.
 * That is a limitation of the action, not of the card: the workflow builds the
 * message itself, so nothing in the card JSON can reach the preview. A real
 * message has a normal one, at the price of the card's layout.
 *
 * Teams renders a small subset of HTML in a message, so this stays with bold,
 * line breaks and links.
 */
export function buildTeamsMessage(event: NotificationEvent, options: TeamsRenderOptions): Record<string, unknown> {
  const { t, language, timeZone } = options
  const marker = toneMarker(toneFor(event))
  const title = eventTitle(event, t)
  const summary = eventSummary(event, t)
  const link = eventLink(event)

  // No adaptive card date placeholders here: the message is plain text to
  // Teams, so the time is rendered once, in the channel's configured zone.
  const facts = eventFacts(event, t, { locale: language, timeZone })

  const lines = [
    `<b>${escapeHtml(`${marker} ${title}`)}</b>`,
    escapeHtml(summary),
    '',
    ...facts.map(fact => `<b>${escapeHtml(fact.label)}:</b> ${escapeHtml(fact.value)}`)
  ]

  if (link) {
    lines.push('', `<a href="${escapeHtml(link)}">${escapeHtml(eventLinkLabel(event, t))}</a>`)
  }

  return { type: 'message', text: lines.join('<br>') }
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
  const link = eventLink(event)

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
    ? [{ type: 'Action.OpenUrl', title: eventLinkLabel(event, t), url: link }]
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
