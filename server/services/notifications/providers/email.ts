import { createTransport } from 'nodemailer'
import type { NotificationEvent } from '../../../../shared/types/notification'
import { emailChannelConfigSchema } from '../../../../shared/utils/validation'
import type { EmailChannelConfig } from '../../../../shared/utils/validation'
import { registerNotificationProvider } from '../registry'
import { renderEmail } from '../templates/email'
import type { NotificationSendContext } from '../types'

/**
 * SMTP transport.
 *
 * A fresh connection per message rather than a pool: notifications are rare
 * enough that the handshake costs nothing worth keeping a socket open for, and a
 * pooled connection that went stale between two outages would fail exactly when
 * it is needed.
 */
export function registerEmailProvider(): void {
  registerNotificationProvider({
    id: 'email',
    labelKey: 'email',
    secretKeys: ['password'],
    validateConfig(config) {
      const result = emailChannelConfigSchema.safeParse(config)

      if (!result.success) {
        // The delivery log is where a misconfigured channel explains itself, so
        // the issues are spelled out instead of handed over as a zod dump.
        const issues = result.error.issues
          .map(issue => `${issue.path.join('.') || 'config'}: ${issue.message}`)
          .join(', ')

        throw new Error(`Invalid email configuration (${issues})`)
      }

      return result.data
    },
    send
  })
}

async function send(event: NotificationEvent, context: NotificationSendContext): Promise<void> {
  // What the queue passes back is what `validateConfig` returned.
  const config = context.config as EmailChannelConfig
  const runtime = useRuntimeConfig()

  const message = renderEmail(event, {
    language: context.language,
    channelName: context.channelName,
    timeZone: config.timezone,
    appName: runtime.public.appName,
    t: translator(context.language)
  })

  // Every stage gets the full budget; the queue's watchdog sits above all of
  // them with a grace period, so it only fires when these fail to.
  const deadline = runtime.notifications.sendTimeoutMs
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password ?? '' } : undefined,
    tls: { rejectUnauthorized: config.rejectUnauthorized },
    connectionTimeout: deadline,
    greetingTimeout: deadline,
    socketTimeout: deadline
  })

  try {
    await transport.sendMail({
      from: config.fromName ? { name: config.fromName, address: config.fromAddress } : config.fromAddress,
      to: config.to,
      replyTo: config.replyTo ?? undefined,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  } finally {
    transport.close()
  }
}
