import type { MonitorRow } from '../../database/schema'
import { checkHttp } from './http'
import { checkPing } from './ping'
import type { CheckExecutor, CheckResult } from './types'

/**
 * Registry of check implementations. Adding a monitor type means adding an
 * executor here and extending the `MonitorType` union plus the monitor form.
 */
const executors: Record<string, CheckExecutor> = {
  http: checkHttp,
  ping: checkPing
}

/**
 * Grace on top of the monitor's own timeout before the executor is given up on.
 * Every executor enforces that timeout itself, so reaching this deadline means
 * one of them failed to.
 */
const EXECUTOR_WATCHDOG_GRACE_MS = 5_000

export async function executeCheck(monitor: MonitorRow): Promise<CheckResult> {
  const executor = executors[monitor.type]

  if (!executor) {
    return { status: 'down', latencyMs: null, statusCode: null, message: `Unsupported monitor type: ${monitor.type}` }
  }

  try {
    return await withWatchdog(monitor, executor(monitor))
  } catch (error) {
    // An executor throwing is a bug, but it must never stop the scheduler.
    return {
      status: 'down',
      latencyMs: null,
      statusCode: null,
      message: error instanceof Error ? error.message : 'Check failed unexpectedly'
    }
  }
}

/**
 * Last line of defence around an executor that never settles. The scheduler
 * keeps a monitor in its in-flight set until its check returns, so a promise
 * left pending does not just lose one result: that monitor is never queued
 * again and silently stops being checked until the process restarts. Losing the
 * result is recoverable, losing the monitor is not.
 */
function withWatchdog(monitor: MonitorRow, check: Promise<CheckResult>): Promise<CheckResult> {
  const deadline = monitor.timeoutSeconds * 1000 + EXECUTOR_WATCHDOG_GRACE_MS

  return new Promise<CheckResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error(`[checks] monitor ${monitor.id} (${monitor.type}) did not settle within ${deadline}ms`)

      resolve({
        status: 'down',
        latencyMs: null,
        statusCode: null,
        message: `Check did not return within ${Math.round(deadline / 1000)}s`
      })
    }, deadline)

    // Attaching to the abandoned promise keeps a late rejection handled: an
    // unhandled one terminates the bun process.
    check.then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export type { CheckResult } from './types'
