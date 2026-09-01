import type { NotificationEvent, NotificationLocale } from '../../../../shared/types/notification'
import {
  escapeHtml,
  eventBadge,
  eventFacts,
  eventLink,
  eventLinkLabel,
  eventSubject,
  eventSummary,
  eventTitle,
  toneFor
} from '../format'
import type { NotificationTone, Translate } from '../format'

/**
 * Palette for the message body. Email clients do not resolve CSS variables, so
 * the light values are written into the markup and the dark ones are applied by
 * a media query with `!important` — an inline style beats a class otherwise.
 *
 * A fair share of clients honour neither. The light rendering therefore has to
 * stand on its own rather than being one half of a pair.
 */
const LIGHT = {
  ground: '#f1f4f6',
  card: '#ffffff',
  ink: '#111b1d',
  muted: '#61757a',
  line: '#e2e9ea',
  sunk: '#f7f9fa'
}

const DARK = {
  ground: '#0b1214',
  card: '#151e21',
  ink: '#e3ebec',
  muted: '#93a6a9',
  line: '#26343a',
  sunk: '#101a1d'
}

/** Accent per event. Dark keeps the hue and only lifts the lightness. */
const TONES: Record<NotificationTone, { light: string, dark: string, wash: string, washDark: string }> = {
  down: { light: '#b23a2c', dark: '#e0705f', wash: '#fbecea', washDark: '#2c1614' },
  up: { light: '#2c7a52', dark: '#59b184', wash: '#e9f5ee', washDark: '#12241a' },
  warning: { light: '#8a6614', dark: '#cfa348', wash: '#f9f1de', washDark: '#26200f' }
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface EmailRenderOptions {
  language: NotificationLocale
  channelName: string
  timeZone: string
  appName: string
  t: Translate
}

interface EmailParts {
  language: NotificationLocale
  tone: (typeof TONES)[NotificationTone]
  status: string
  title: string
  summary: string
  facts: { label: string, value: string }[]
  link: string | null
  linkLabel: string
  footer: string
}

export function renderEmail(event: NotificationEvent, options: EmailRenderOptions): RenderedEmail {
  const { t, language, timeZone } = options
  const parts: EmailParts = {
    language,
    tone: TONES[toneFor(event)],
    status: eventBadge(event, t),
    title: eventTitle(event, t),
    summary: eventSummary(event, t),
    facts: eventFacts(event, t, { locale: language, timeZone }),
    link: eventLink(event),
    linkLabel: eventLinkLabel(event, t),
    footer: t('notification.footer', { app: options.appName, channel: options.channelName })
  }

  return {
    subject: eventSubject(event, t),
    text: renderText(parts),
    html: renderHtml(parts)
  }
}

function renderText({ title, summary, facts, link, footer }: EmailParts): string {
  const lines = [title, '', summary, '']

  for (const fact of facts) {
    lines.push(`${fact.label}: ${fact.value}`)
  }

  if (link) {
    lines.push('', link)
  }

  lines.push('', '--', footer)

  return lines.join('\n')
}

function renderHtml(parts: EmailParts): string {
  const { language, tone, status, title, summary, facts, link, linkLabel, footer } = parts

  const rows = facts.map(fact => `
                <tr>
                  <td class="label" style="padding:10px 16px;border-top:1px solid ${LIGHT.line};color:${LIGHT.muted};font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(fact.label)}</td>
                  <td class="value" style="padding:10px 16px;border-top:1px solid ${LIGHT.line};color:${LIGHT.ink};font-size:14px;vertical-align:top">${escapeHtml(fact.value)}</td>
                </tr>`).join('')

  // A padded table cell rather than a styled anchor: Outlook drops the padding
  // of an inline element and the button loses its shape.
  const button = link
    ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px">
                <tr>
                  <td class="button" style="background:${tone.light};border-radius:4px">
                    <a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(linkLabel)}</a>
                  </td>
                </tr>
              </table>`
    : ''

  return `<!doctype html>
<html lang="${language}" style="margin:0;padding:0">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .ground { background:${DARK.ground} !important; }
    .card { background:${DARK.card} !important; border-color:${DARK.line} !important; }
    .heading, .value { color:${DARK.ink} !important; }
    .lead, .label, .footer { color:${DARK.muted} !important; }
    .label, .value { border-color:${DARK.line} !important; }
    .facts { background:${DARK.sunk} !important; border-color:${DARK.line} !important; }
    .pill { background:${tone.washDark} !important; color:${tone.dark} !important; }
    .accent { background:${tone.dark} !important; }
    .button { background:${tone.dark} !important; }
    .button a { color:${DARK.ground} !important; }
  }
  @media (max-width: 620px) {
    .card { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body class="ground" style="margin:0;padding:0;background:${LIGHT.ground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;mso-hide:all">${escapeHtml(summary)}</div>
  <div style="display:none;max-height:0;overflow:hidden">${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>
  <table role="presentation" class="ground" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${LIGHT.ground}">
    <tr>
      <td align="center" style="padding:28px 12px">
        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${LIGHT.card};border:1px solid ${LIGHT.line};border-radius:6px;overflow:hidden">
          <tr>
            <td class="accent" style="height:4px;background:${tone.light};font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td class="pad" style="padding:28px 32px 0">
              <span class="pill" style="display:inline-block;padding:3px 10px;border-radius:3px;background:${tone.wash};color:${tone.light};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(status)}</span>
              <h1 class="heading" style="margin:14px 0 0;color:${LIGHT.ink};font-size:22px;line-height:1.25;font-weight:600">${escapeHtml(title)}</h1>
              <p class="lead" style="margin:10px 0 0;color:${LIGHT.muted};font-size:15px;line-height:1.55">${escapeHtml(summary)}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:22px 32px 0">
              <table role="presentation" class="facts" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${LIGHT.sunk};border:1px solid ${LIGHT.line};border-radius:4px">${rows}
              </table>${button}
            </td>
          </tr>
          <tr>
            <td class="pad footer" style="padding:26px 32px 28px;color:${LIGHT.muted};font-size:12px;line-height:1.5">${escapeHtml(footer)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
