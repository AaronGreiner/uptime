import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, RequestOptions } from 'node:http'
import type { TLSSocket } from 'node:tls'
import { matchesExpectedStatus } from '../../../shared/utils/monitor'
import type { MonitorRow } from '../../database/schema'
import type { CheckResult } from './types'

const MAX_REDIRECTS = 5
/** Response bodies are only read for keyword checks and are capped hard. */
const MAX_BODY_BYTES = 2 * 1024 * 1024

interface RawResponse {
  statusCode: number
  body: string
  certificateExpiresAt: number | null
  location: string | null
}

/**
 * Performs the HTTP(S) check. `node:https` is used instead of `fetch` because it
 * exposes the peer certificate, per request TLS options and redirect control on
 * a single connection.
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
  let certificateExpiresAt: number | null = null

  try {
    let response: RawResponse | null = null
    let redirects = 0

    while (true) {
      const remaining = deadline - (performance.now() - startedAt)

      if (remaining <= 0) {
        throw new TimeoutError()
      }

      response = await sendRequest(monitor, target, remaining, redirects === 0)
      certificateExpiresAt = response.certificateExpiresAt ?? certificateExpiresAt

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
          certificateExpiresAt
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
        certificateExpiresAt
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
          certificateExpiresAt
        }
      }
    }

    return { status: 'up', latencyMs, statusCode, message: `HTTP ${statusCode}`, certificateExpiresAt }
  } catch (error) {
    return {
      status: 'down',
      latencyMs: null,
      statusCode: null,
      message: describeError(error, monitor.timeoutSeconds),
      certificateExpiresAt
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

    const send = secure ? httpsRequest : httpRequest
    const request = send(target, options, (response: IncomingMessage) => {
      const certificateExpiresAt = secure && monitor.checkCertificateExpiry
        ? readCertificateExpiry(response.socket as TLSSocket)
        : null

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

      response.on('error', reject)
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: needsBody ? Buffer.concat(chunks).toString('utf8') : '',
          certificateExpiresAt,
          location: response.headers.location ?? null
        })
      })

      // Discard the payload as fast as possible when no keyword is configured.
      if (!needsBody) {
        response.resume()
      }
    })

    const timer = setTimeout(() => {
      request.destroy(new TimeoutError())
    }, timeoutMs)

    request.on('error', reject)
    request.on('close', () => clearTimeout(timer))

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

function readCertificateExpiry(socket: TLSSocket): number | null {
  const certificate = typeof socket?.getPeerCertificate === 'function' ? socket.getPeerCertificate() : null

  if (!certificate?.valid_to) {
    return null
  }

  const expiresAt = Date.parse(certificate.valid_to)

  return Number.isNaN(expiresAt) ? null : Math.floor(expiresAt / 1000)
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
