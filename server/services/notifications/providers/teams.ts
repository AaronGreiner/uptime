import type { NotificationEvent } from '../../../../shared/types/notification'
import { teamsChannelConfigSchema } from '../../../../shared/utils/validation'
import type { TeamsChannelConfig } from '../../../../shared/utils/validation'
import { registerNotificationProvider } from '../registry'
import { buildTeamsRequest } from '../templates/teams'
import type { NotificationSendContext } from '../types'

/** Body of an error response is quoted back, but not an entire error page. */
const MAX_RESPONSE_EXCERPT = 300

export function registerTeamsProvider(): void {
  registerNotificationProvider({
    id: 'teams',
    labelKey: 'teams',
    // The workflow URL is the credential: anyone holding it can post to the
    // channel, so it never leaves the server either.
    secretKeys: ['workflowUrl'],
    validateConfig(config) {
      const result = teamsChannelConfigSchema.safeParse(config)

      if (!result.success) {
        const issues = result.error.issues
          .map(issue => `${issue.path.join('.') || 'config'}: ${issue.message}`)
          .join(', ')

        throw new Error(`Invalid Teams configuration (${issues})`)
      }

      return result.data
    },
    send
  })
}

async function send(event: NotificationEvent, context: NotificationSendContext): Promise<void> {
  const config = context.config as TeamsChannelConfig
  const runtime = useRuntimeConfig()

  const payload = buildTeamsRequest(event, {
    format: config.format,
    language: context.language,
    channelName: context.channelName,
    // The card carries adaptive card date placeholders that Teams resolves per
    // viewer, so this only matters for the message format.
    timeZone: config.timezone,
    appName: runtime.public.appName,
    t: translator(context.language)
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), runtime.notifications.sendTimeoutMs)

  let response: Response

  try {
    response = await fetch(config.workflowUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Teams did not answer within ${Math.round(runtime.notifications.sendTimeoutMs / 1000)}s`,
        { cause: error }
      )
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }

  const body = (await response.text()).trim()

  if (!response.ok) {
    throw new Error(`Teams returned ${response.status} ${response.statusText}${body ? `: ${excerpt(body)}` : ''}`)
  }

  assertWorkflowSucceeded(body)
}

/**
 * The webhook answers before the workflow behind it has run, so a 202 is not yet
 * proof of anything. When it does answer with a body, a failing run reports it
 * as a JSON `error` object alongside a perfectly successful status code.
 */
function assertWorkflowSucceeded(body: string): void {
  if (!body) {
    return
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(body)
  } catch {
    // Not JSON, so there is no structured error to read.
    return
  }

  if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(`Teams rejected the message: ${excerpt(JSON.stringify(parsed.error))}`)
  }
}

function excerpt(value: string): string {
  return value.length > MAX_RESPONSE_EXCERPT ? `${value.slice(0, MAX_RESPONSE_EXCERPT)}…` : value
}
