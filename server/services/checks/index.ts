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

export async function executeCheck(monitor: MonitorRow): Promise<CheckResult> {
  const executor = executors[monitor.type]

  if (!executor) {
    return { status: 'down', latencyMs: null, statusCode: null, message: `Unsupported monitor type: ${monitor.type}` }
  }

  try {
    return await executor(monitor)
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

export type { CheckResult } from './types'
