import {
  WEB_MOBILE_ENDPOINT,
  WEB_MOBILE_CREATE,
  WEB_MOBILE_DEVICES,
  WEB_MOBILE_REVOKE
} from '../../../../../shared/web-mobile-pairing-contract'
import { callRuntimeResult } from '../../runtime/client/web-runtime-calls'
import type { MobileApi } from '../../../../../preload/api/mobile/mobile-api'
import type { PreloadApi } from '../../../../../preload/api-types'
import { noopUnsubscribe } from '../web-storage'

export function createWebMobileApi(): Partial<PreloadApi> {
  return {
    mobile: {
      listNetworkInterfaces: async () => {
        const result = await callRuntimeResult<{ available: boolean; endpoint?: string }>(
          WEB_MOBILE_ENDPOINT,
          {}
        ).catch(() => ({ available: false, endpoint: undefined }))
        return {
          interfaces:
            result.available && result.endpoint
              ? [
                  {
                    name: new URL(result.endpoint).hostname,
                    address: result.endpoint,
                    hasDefaultRoute: true
                  }
                ]
              : []
        }
      },
      getPairingQR: async (args) => {
        if (args?.connectionMode === 'automatic') {
          return {
            available: false,
            guidance: 'Choose LAN to use this server over Wi-Fi or Tailscale.'
          }
        }
        // The server owner pins the endpoint; browser input cannot substitute a destination.
        return callRuntimeResult<Awaited<ReturnType<MobileApi['getPairingQR']>>>(
          WEB_MOBILE_CREATE,
          { rotate: args?.rotate === true }
        ).catch(() => ({
          available: false as const,
          guidance: 'Could not contact the server for pairing. Reconnect and try again.'
        }))
      },
      getWindowsFirewallStatus: () => Promise.resolve({ supported: false }),
      repairWindowsFirewall: () => Promise.resolve({ ok: false, reason: 'unsupported' }),
      openWindowsNetworkSettings: () => Promise.resolve(false),
      getRuntimePairingUrl: () => Promise.resolve({ available: false }),
      listDevices: () =>
        callRuntimeResult<Awaited<ReturnType<MobileApi['listDevices']>>>(
          WEB_MOBILE_DEVICES,
          {}
        ).catch(() => ({ devices: [] })),
      revokeDevice: (args) =>
        callRuntimeResult<{ revoked: boolean }>(WEB_MOBILE_REVOKE, { deviceId: args.deviceId }),
      listRuntimeAccessGrants: () => Promise.resolve({ grants: [] }),
      revokeRuntimeAccess: () => Promise.resolve({ revoked: false }),
      getRelayStatus: () => Promise.resolve({ status: 'offline' as const }),
      onRelayStatusChanged: () => noopUnsubscribe,
      consumePendingUnpairedDeviceAuthFailure: () => Promise.resolve(false),
      onUnpairedDeviceAuthFailure: () => noopUnsubscribe
    }
  }
}
