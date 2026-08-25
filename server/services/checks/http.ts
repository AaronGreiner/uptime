import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, RequestOptions } from 'node:http'
import { matchesExpectedStatus } from '../../../shared/utils/monitor'
import type { MonitorRow } from '../../database/schema'
import { probeCertificateExpiry } from './certificate'
import type { CheckResult } from './types'

const MAX_REDIRECTS = 5
/** Response bodies are only read for keyword checks and are capped hard. */
const MAX_BODY_BYTES = 2 * 1024 * 1024

interface RawResponse {
  statusCode: number
  body: string
  location: string | null
}

/**
 * Performs the HTTP(S) check. `node:https` is used instead of `fetch` because it
 * gives per request TLS options and manual redirect control on one connection.
 * The certificate is read by a probe of its own, see `./certificate`.
 */
export async function checkHttp(monitor: MonitorRow): Promise<CheckResult> {
  const startedAt = performance.now()
  let target: URL

  try {
    target = new URL(monitor.url)
  } catch {
    return { status: 'down', latencyMs: null, statusCode: null, message: `Invalid URL: ${monitor.url}` }
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { status: 'down', latencyMs: null, statusCode: null, message: `Unsupported protocol: ${target.protocol}` }
  }

  const deadline = monitor.timeoutSeconds * 1000

  // Runs alongside the request rather than after it, so reading the certificate
  // costs no wall clock time and stays inside the monitor's own timeout. It
  // reads the certificate of the configured URL, not of a redirect target: that
  // is the handshake the check itself fails on once the certificate expires.
  const certificate = target.protocol === 'https:' && monitor.checkCertificateExpiry
    ? probeCertificateExpiry(target, deadline)
    : Promise.resolve(null)

  try {
    let response: RawResponse | null = null
    let redirects = 0

    while (true) {
      const remaining = deadline - (performance.now() - startedAt)

      if (remaining <= 0) {
        throw new TimeoutError()
      }

      response = await sendRequest(monitor, target, remaining, redirects === 0)

      const isRedirect = response.location !== null && response.statusCode >= 300 && response.statusCode < 400

      if (!monitor.followRedirects || !isRedirect) {
        break
      }

      if (++redirects > MAX_REDIRECTS) {
        return {
          status: 'down',
          latencyMs: Math.round(performance.now() - startedAt),
          statusCode: response.statusCode,
          message: `Too many redirects (>${MAX_REDIRECTS})`,
          certificateExpiresAt: await certificate
        }
      }

      target = new URL(response.location!, target)
    }

    const latencyMs = Math.round(performance.now() - startedAt)
    const { statusCode, body } = response

    if (!matchesExpectedStatus(statusCode, monitor.expectedStatusCodes)) {
      return {
        status: 'down',
        latencyMs,
        statusCode,
        message: `HTTP ${statusCode}, expected ${monitor.expectedStatusCodes}`,
        certificateExpiresAt: await certificate
      }
    }

    if (monitor.keyword) {
      const found = body.includes(monitor.keyword)

      if (found === monitor.keywordInverted) {
        return {
          status: 'down',
          latencyMs,
          statusCode,
          message: found
            ? `Forbidden keyword "${monitor.keyword}" found`
            : `Keyword "${monitor.keyword}" not found`,
          certificateExpiresAt: await certificate
        }
      }
    }

    return { status: 'up', latencyMs, statusCode, message: `HTTP ${statusCode}`, certificateExpiresAt: await certificate }
  } catch (error) {
    return {
      status: 'down',
      latencyMs: null,
      statusCode: null,
      message: describeError(error, monitor.timeoutSeconds),
      certificateExpiresAt: await certificate
    }
  }
}

function sendRequest(monitor: MonitorRow, target: URL, timeoutMs: number, sendBody: boolean): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const secure = target.protocol === 'https:'
    const options: RequestOptions = {
      method: monitor.method || 'GET',
      headers: {
        'user-agent': 'Uptime/1.0 (+https://github.com/uptime)',
        'accept': '*/*',
        'accept-encoding': 'identity',
        ...normalizeHeaders(monitor.headers)
      },
      // Node rejects an unresolved promise on a socket that is never released.
      agent: false
    }

    if (secure) {
      Object.assign(options, {
        rejectUnauthorized: !monitor.ignoreTls,
        servername: target.hostname
      })
    }

    let settled = false
    let incoming: IncomingMessage | null = null

    const finish = (handler: () => void) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      handler()
    }

    const send = secure ? httpsRequest : httpRequest
    const request = send(target, options, (response: IncomingMessage) => {
      incoming = response

      const needsBody = Boolean(monitor.keyword)
      const chunks: Buffer[] = []
      let size = 0

      response.on('data', (chunk: Buffer) => {
        if (!needsBody || size >= MAX_BODY_BYTES) {
          return
        }

        size += chunk.length
        chunks.push(chunk)
      })

      response.on('error', (error: Error) => finish(() => reject(error)))
      response.on('end', () => finish(() => resolve({
        statusCode: response.statusCode ?? 0,
        body: needsBody ? Buffer.concat(chunks).toString('utf8') : '',
        location: response.headers.location ?? null
      })))

      // Discard the payload as fast as possible when no keyword is configured.
      if (!needsBody) {
        response.resume()
      }
    })

    // The deadline covers the response body too, so it must survive the request
    // side finishing: bun emits `close` on the ClientRequest as soon as the
    // response headers arrive, and clearing the timer there left a stalled body
    // with no deadline at all. The check then never returned, and the scheduler
    // kept the monitor in its in-flight set forever.
    //
    // Rejecting before destroying is deliberate as well. Destroying the response
    // makes bun emit `end` on it rather than an error, which would resolve the
    // promise with a truncated body and report the timed out check as up.
    const timer = setTimeout(() => {
      finish(() => reject(new TimeoutError()))
      request.destroy(new TimeoutError())
      incoming?.destroy()
    }, timeoutMs)

    request.on('error', (error: Error) => finish(() => reject(error)))

    if (sendBody && monitor.body && monitor.method !== 'GET' && monitor.method !== 'HEAD') {
      request.write(monitor.body)
    }

    request.end()
  })
}

function normalizeHeaders(headers: Record<string, string> | null): Record<string, string> {
  if (!headers) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => key.trim().length > 0 && typeof value === 'string')
      .map(([key, value]) => [key.trim().toLowerCase(), value])
  )
}

class TimeoutError extends Error {
  constructor() {
    super('timeout')
    this.name = 'TimeoutError'
  }
}

function describeError(error: unknown, timeoutSeconds: number): string {
  if (error instanceof TimeoutError) {
    return `Timed out after ${timeoutSeconds}s`
  }

  const code = (error as NodeJS.ErrnoException)?.code

  switch (code) {
    case 'ENOTFOUND': return 'DNS lookup failed'
    case 'ECONNREFUSED': return 'Connection refused'
    case 'ECONNRESET': return 'Connection reset'
    case 'EHOSTUNREACH': return 'Host unreachable'
    case 'ETIMEDOUT': return `Timed out after ${timeoutSeconds}s`
    case 'CERT_HAS_EXPIRED': return 'TLS certificate has expired'
    case 'DEPTH_ZERO_SELF_SIGNED_CERT': return 'Self signed TLS certificate'
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE': return 'TLS certificate could not be verified'
  }

  return error instanceof Error ? error.message : 'Unknown error'
}
