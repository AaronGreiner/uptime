import type { NotificationEvent, NotificationLocale } from '../../../../shared/types/notification'
import {
  escapeHtml,
  eventFacts,
  eventSummary,
  eventTitle,
  monitorUrl,
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
  options: TeamsRenderOptions & { format: 'card' | 'message' | 'modern' }
): Record<string, unknown> {
  if (options.format === 'message') {
    return buildTeamsMessage(event, options)
  }

  if (options.format === 'modern') {
    return buildTeamsModernMessage(event, options)
  }

  return buildTeamsPayload(event, options)
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
  const link = monitorUrl(event.monitor.id)

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
    lines.push('', `<a href="${escapeHtml(link)}">${escapeHtml(t('notification.action.openMonitor'))}</a>`)
  }

  return { type: 'message', text: lines.join('<br>') }
}

/**
 * A richer HTML variant for the same Power Automate message action.
 *
 * Teams sanitises the message before rendering it and its desktop, web and
 * mobile clients do not agree on every HTML detail. The semantic structure
 * therefore remains readable when the inline spacing is stripped: a heading,
 * a paragraph, a two-column table and a final link.
 */
export function buildTeamsModernMessage(
  event: NotificationEvent,
  options: TeamsRenderOptions
): Record<string, unknown> {
  const { t, language, timeZone } = options
  const marker = toneMarker(toneFor(event))
  const title = eventTitle(event, t)
  const summary = eventSummary(event, t)
  const link = monitorUrl(event.monitor.id)
  const targetLabel = t('notification.field.target')
  const facts = eventFacts(event, t, { locale: language, timeZone })

  const rows = facts.map((fact) => {
    const escapedValue = escapeHtml(fact.value)
    const value = fact.label === targetLabel && /^https?:\/\//i.test(fact.value)
      ? `<a href="${escapedValue}">${escapedValue}</a>`
      : escapedValue

    return `<tr><td style="padding:3px 18px 3px 0;vertical-align:top;white-space:nowrap"><strong>${escapeHtml(fact.label)}</strong></td><td style="padding:3px 0;vertical-align:top">${value}</td></tr>`
  }).join('')

  const action = link
    ? `<p style="margin:16px 0 0"><strong><a href="${escapeHtml(link)}">${escapeHtml(t('notification.action.openMonitor'))} &rarr;</a></strong></p>`
    : ''

  return {
    type: 'message',
    text: `<div><h3 style="margin:0 0 8px">${escapeHtml(`${marker} ${title}`)}</h3><p style="margin:0 0 14px">${escapeHtml(summary)}</p><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>${action}</div>`
  }
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
