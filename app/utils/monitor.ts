import type { Monitor } from '#shared/types/monitor'
import type { MonitorInput } from '#shared/utils/validation'

/**
 * The update endpoint replaces the whole monitor, so partial changes such as
 * pausing have to send the full configuration back.
 */
export function toMonitorInput(monitor: Monitor): MonitorInput {
  return {
    name: monitor.name,
    icon: monitor.icon,
    type: monitor.type,
    description: monitor.description,
    groupId: monitor.groupId,
    intervalSeconds: monitor.intervalSeconds,
    timeoutSeconds: monitor.timeoutSeconds,
    retries: monitor.retries,
    active: monitor.active,
    url: monitor.url,
    method: monitor.method as MonitorInput['method'],
    headers: monitor.headers,
    body: monitor.body,
    expectedStatusCodes: monitor.expectedStatusCodes,
    keyword: monitor.keyword,
    keywordInverted: monitor.keywordInverted,
    followRedirects: monitor.followRedirects,
    ignoreTls: monitor.ignoreTls,
    checkCertificateExpiry: monitor.checkCertificateExpiry,
    certificateExpiryWarningDays: monitor.certificateExpiryWarningDays,
    hostname: monitor.hostname,
    packetCount: monitor.packetCount,
    notificationMode: monitor.notificationMode,
    notificationGroupIds: monitor.notificationGroupIds
  }
}
