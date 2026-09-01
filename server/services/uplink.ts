import { promises as dns } from 'node:dns'
import { connect } from 'node:net'
import type { UplinkFault, UplinkStatus } from '../../shared/types/uplink'
import { nowInSeconds } from '../utils/time'

/**
 * Whether the instance itself can still reach anything.
 *
 * A host that loses its uplink fails every check in the same second, and no
 * check result tells the two apart: a broken router and a dead server both
 * arrive as `status: 'down'`. The probe below asks a question no monitored
 * target takes part in, so its answer is about us rather than about them, and
 * that is what lets `recordCheckResult` record a reading without judging it.
 *
 * It runs on the check path rather than on an interval of its own: a healthy
 * instance never probes, and the first failing check pays for the verdict every
 * following one reads. Concurrent callers share the probe in flight, so a total
 * outage costs one probe per `cacheMs` however many monitors are due.
 */

interface UplinkConfig {
  enabled: boolean
  targets: string
  dnsHost: string
  timeoutMs: number
  failureThreshold: number
  cacheMs: number
}

interface Target {
  host: string
  port: number
}

const ONLINE: UplinkStatus = { online: true, since: null, fault: null, checkedAt: null }

let status: UplinkStatus = ONLINE
let checkedAtMs = 0
let consecutiveFailures = 0
let pending: Promise<UplinkStatus> | null = null

/** Called when the verdict flips, so the announcement lives outside this file. */
type UplinkListener = (status: UplinkStatus, previous: UplinkStatus) => void

const listeners = new Set<UplinkListener>()

export function onUplinkChange(listener: UplinkListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/**
 * The last verdict, without probing. Synchronous on purpose: `recordCheckResult`
 * and the delivery queue both read it, and neither may await anything.
 */
export function getUplinkStatus(): UplinkStatus {
  return status
}

export function isUplinkDown(): boolean {
  return !status.online
}

/**
 * Whether a failed monitor check may be blamed on its target.
 *
 * The first failed probe is deliberately enough to withhold that one reading,
 * even though the global outage needs several probes before it is announced.
 * Otherwise the debounce would protect the banner from a transient at the cost
 * of already turning monitors down during the same transient.
 */
export function shouldWithholdCheckResult(): boolean {
  return !status.online || consecutiveFailures > 0
}

/**
 * Refreshes the verdict unless a recent one still stands, and returns it.
 *
 * Only ever called after a check has already failed, which is the one moment
 * the answer changes anything.
 */
export async function ensureUplinkVerdict(): Promise<UplinkStatus> {
  const config = uplinkConfig()

  if (!config.enabled) {
    return status
  }

  if (Date.now() - checkedAtMs < config.cacheMs) {
    return status
  }

  // A probe already running answers for everyone waiting on it. Without this a
  // full outage would start one probe per due monitor.
  pending ??= probe(config).finally(() => {
    pending = null
  })

  return pending
}

/** Resets the verdict, so a test or a restart does not inherit an old outage. */
export function resetUplinkStatus(): void {
  status = ONLINE
  checkedAtMs = 0
  consecutiveFailures = 0
}

async function probe(config: UplinkConfig): Promise<UplinkStatus> {
  const targets = parseTargets(config.targets)
  const [routed, resolved] = await Promise.all([
    targets.length ? reachAny(targets, config.timeoutMs) : Promise.resolve(true),
    config.dnsHost ? resolves(config.dnsHost, config.timeoutMs) : Promise.resolve(true)
  ])

  checkedAtMs = Date.now()

  // The route is reported first: a host with no way out cannot resolve anything
  // either, and naming DNS there would send somebody after the wrong fault.
  const fault: UplinkFault | null = routed ? (resolved ? null : 'dns') : 'network'

  apply(fault, config.failureThreshold)

  return status
}

/**
 * Applies one probe result to the verdict.
 *
 * Going down needs `failureThreshold` probes in a row, because a single lost
 * packet must not excuse a real outage; coming back up needs one, because the
 * cost of judging again a few seconds early is a single check.
 */
function apply(fault: UplinkFault | null, threshold: number): void {
  const previous = status
  const now = nowInSeconds()

  if (!fault) {
    consecutiveFailures = 0
    status = { online: true, since: null, fault: null, checkedAt: now }
  } else {
    consecutiveFailures += 1

    if (consecutiveFailures < threshold && previous.online) {
      status = { ...previous, checkedAt: now }
    } else {
      status = { online: false, since: previous.since ?? now, fault, checkedAt: now }
    }
  }

  if (status.online === previous.online) {
    return
  }

  console.warn(status.online
    ? `[uplink] restored after ${now - (previous.since ?? now)}s`
    : `[uplink] lost, ${fault === 'dns' ? 'DNS is not answering' : 'no route out'}`)

  for (const listener of listeners) {
    try {
      listener(status, previous)
    } catch (error) {
      // A listener must never take the checks down with it.
      console.error('[uplink] listener failed:', error)
    }
  }
}

/** `host:port,host:port`. A malformed entry is dropped rather than fatal. */
function parseTargets(value: string): Target[] {
  const targets: Target[] = []

  for (const entry of value.split(',')) {
    const trimmed = entry.trim()

    if (!trimmed) {
      continue
    }

    const separator = trimmed.lastIndexOf(':')
    const host = separator === -1 ? trimmed : trimmed.slice(0, separator)
    const port = separator === -1 ? 443 : Number(trimmed.slice(separator + 1))

    if (host && Number.isInteger(port) && port > 0 && port <= 65_535) {
      targets.push({ host, port })
    }
  }

  return targets
}

/** True when at least one independent target answers. */
async function reachAny(targets: Target[], timeoutMs: number): Promise<boolean> {
  const results = await Promise.all(targets.map(target => reach(target, timeoutMs)))

  return results.includes(true)
}

function reach(target: Target, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: target.host, port: target.port })
    let settled = false

    const finish = (reachable: boolean) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      // An error arriving after the socket is gone would otherwise be unhandled,
      // and an unhandled rejection ends the bun process.
      socket.removeAllListeners('error')
      socket.on('error', () => {})
      socket.destroy()
      resolve(reachable)
    }

    const timer = setTimeout(() => finish(false), timeoutMs)

    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

async function resolves(host: string, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined

  try {
    // `dns.lookup` has no deadline of its own and a resolver that accepts the
    // query and never answers would hold the probe open for as long as the
    // system resolver allows.
    return await Promise.race([
      dns.lookup(host).then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      })
    ])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function uplinkConfig(): UplinkConfig {
  return useRuntimeConfig().uplink
}
