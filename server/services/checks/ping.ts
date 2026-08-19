import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import type { MonitorRow } from '../../database/schema'
import type { CheckResult } from './types'

/**
 * Hostnames and IP literals only. The binary is spawned without a shell, so this
 * is a sanity guard rather than an injection defence, but it keeps the argument
 * list free of flag-looking values.
 */
const HOSTNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/

/** Matches `time=12.3 ms`, `time=12ms` and the Windows `time<1ms` variant. */
const RTT_PATTERN = /time[=<]\s*([\d.]+)\s*ms/gi

/**
 * Runs the system `ping` binary. Raw ICMP sockets would need CAP_NET_RAW, while
 * the setuid binary present in most images works without extra capabilities.
 */
export async function checkPing(monitor: MonitorRow): Promise<CheckResult> {
  const host = monitor.hostname.trim()

  if (!HOSTNAME_PATTERN.test(host) && !IPV6_PATTERN.test(host)) {
    return { status: 'down', latencyMs: null, statusCode: null, message: `Invalid hostname: ${monitor.hostname}` }
  }

  const count = Math.max(1, Math.min(10, monitor.packetCount))
  const timeoutMs = monitor.timeoutSeconds * 1000

  try {
    const output = await runPing(host, count, monitor.timeoutSeconds, timeoutMs)
    const timings = [...output.matchAll(RTT_PATTERN)].map(match => Number(match[1])).filter(Number.isFinite)

    if (!timings.length) {
      return {
        status: 'down',
        latencyMs: null,
        statusCode: null,
        message: extractPingError(output) ?? '100% packet loss'
      }
    }

    const average = timings.reduce((sum, value) => sum + value, 0) / timings.length
    const loss = Math.round((1 - timings.length / count) * 100)

    return {
      status: 'up',
      latencyMs: Math.round(average),
      statusCode: null,
      message: loss > 0 ? `${timings.length}/${count} replies, ${loss}% loss` : `${timings.length}/${count} replies`
    }
  } catch (error) {
    return {
      status: 'down',
      latencyMs: null,
      statusCode: null,
      message: error instanceof Error ? error.message : 'Ping failed'
    }
  }
}

function buildArguments(host: string, count: number, timeoutSeconds: number): string[] {
  switch (platform()) {
    case 'win32':
      return ['-n', String(count), '-w', String(timeoutSeconds * 1000), host]
    case 'darwin':
      // -W is a per packet timeout in milliseconds on BSD derived systems.
      return ['-n', '-c', String(count), '-W', String(timeoutSeconds * 1000), host]
    default:
      // iputils: -W per packet seconds, -w overall deadline in seconds.
      return ['-n', '-c', String(count), '-W', String(timeoutSeconds), '-w', String(timeoutSeconds), host]
  }
}

function runPing(host: string, count: number, timeoutSeconds: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ping', buildArguments(host, count, timeoutSeconds), {
      shell: false,
      windowsHide: true
    })

    let output = ''
    let settled = false

    const finish = (handler: () => void) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      handler()
    }

    // The overall deadline flag is unavailable on some platforms, so the process
    // is killed here as well.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(() => reject(new Error(`Timed out after ${timeoutSeconds}s`)))
    }, timeoutMs + 500)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(() => reject(
        error.code === 'ENOENT'
          ? new Error('The "ping" binary is not available in this environment')
          : error
      ))
    })

    // A non zero exit code still carries usable output (packet loss, DNS errors).
    child.on('close', () => finish(() => resolve(output)))
  })
}

function extractPingError(output: string): string | null {
  const normalized = output.trim()

  if (!normalized) {
    return null
  }

  if (/unknown host|Name or service not known|cannot resolve|could not find host/i.test(normalized)) {
    return 'DNS lookup failed'
  }

  if (/network is unreachable/i.test(normalized)) {
    return 'Network unreachable'
  }

  if (/host is down|Destination Host Unreachable/i.test(normalized)) {
    return 'Host unreachable'
  }

  return null
}
