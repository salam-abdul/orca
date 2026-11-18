import type { DeviceScope } from '../../../../shared/remote-runtime/session-graph/runtime-session-contracts'

// Stamp proven scope at transport boundary; status.get has no connection context.
export function injectDeviceScope(response: string, scope: DeviceScope): string {
  try {
    const parsed: unknown = JSON.parse(response)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('ok' in parsed) ||
      parsed.ok !== true ||
      !('result' in parsed) ||
      typeof parsed.result !== 'object' ||
      parsed.result === null
    ) {
      return response
    }
    Object.assign(parsed.result, { deviceScope: scope })
    return JSON.stringify(parsed)
  } catch {
    return response
  }
}
