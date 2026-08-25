import { isIP } from 'node:net'
import { connect } from 'node:tls'
import type { TLSSocket } from 'node:tls'

/**
 * How long one reading is reused. Certificates are valid for months, while a
 * monitor may run every twenty seconds, and every probe is a second connection
 * to a host the check already talks to.
 */
const CACHE_SECONDS = 6 * 60 * 60

interface CachedExpiry {
  expiresAt: number
  readAt: number
}

/** Keyed by host and port: the certificate belongs to the endpoint, not to a monitor. */
const cache = new Map<string, CachedExpiry>()

/**
 * Reads the expiry of the certificate a host presents.
 *
 * The connection is opened here rather than read off the check's own request,
 * because bun's `node:https` is backed by its native HTTP client: it hands the
 * response callback a plain `net.Socket`, ignores a custom `createConnection`,
 * and gives no other route to the peer certificate. `tls.connect` behaves
 * identically on both runtimes.
 *
 * Never rejects. A certificate that cannot be read is not a failed check, and
 * the reading is deliberately unverified: an expired or otherwise invalid
 * certificate is the one most worth reporting, and the request itself is what
 * enforces `ignoreTls`.
 */
export function probeCertificateExpiry(target: URL, timeoutMs: number): Promise<number | null> {
  const host = target.hostname
  const port = Number(target.port) || 443
  const key = `${host}:${port}`
  const now = Math.floor(Date.now() / 1000)
  const cached = cache.get(key)

  if (cached && now - cached.readAt < CACHE_SECONDS) {
    return Promise.resolve(cached.expiresAt)
  }

  return new Promise<number | null>((resolve) => {
    const socket = connect({
      host,
      port,
      // SNI carries host names only, and an address literal makes the handshake
      // fail on servers that parse it strictly.
      servername: isIP(host) ? undefined : host,
      rejectUnauthorized: false,
      ALPNProtocols: ['http/1.1']
    })

    const timer = setTimeout(() => finish(null), timeoutMs)
    let settled = false

    function finish(expiresAt: number | null): void {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      socket.destroy()

      // Only a reading is worth keeping. Caching a failure would hold a host
      // that recovers at the stale answer for hours.
      if (expiresAt !== null) {
        cache.set(key, { expiresAt, readAt: now })
      }

      resolve(expiresAt)
    }

    socket.on('secureConnect', () => finish(readExpiry(socket)))
    socket.on('error', () => finish(null))
  })
}

function readExpiry(socket: TLSSocket): number | null {
  const certificate = typeof socket.getPeerCertificate === 'function' ? socket.getPeerCertificate() : null

  if (!certificate?.valid_to) {
    return null
  }

  const expiresAt = Date.parse(certificate.valid_to)

  return Number.isNaN(expiresAt) ? null : Math.floor(expiresAt / 1000)
}
