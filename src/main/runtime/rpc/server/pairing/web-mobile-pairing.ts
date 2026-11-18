import { encodeMobilePairingQr } from './mobile-pairing-qr'
import type { RuntimeRpcMobilePairing } from '../runtime-rpc-mobile-pairing'
import { MOBILE_PAIRING_OFFER_TTL_MS } from './pairing-offer-expiry'
import {
  WEB_MOBILE_NOT_APPROVED,
  type WebMobilePairingQR,
  type WebMobileDevice
} from '../../../../../shared/web-mobile-pairing-contract'
import { readWebMobilePairingPolicy, webMobilePairingAllowed } from './web-mobile-pairing-policy'

type MobileRow = WebMobileDevice & { scope: string; createdByDeviceId?: string }

export type WebMobilePairingContext = {
  endpoint(): string | null
  create(rotate: boolean): Promise<WebMobilePairingQR>
  devices(): Promise<{ devices: WebMobileDevice[] }>
  revoke(deviceId: string): Promise<{ revoked: boolean }>
}

export function createWebMobilePairingContext(
  device: { deviceId: string; scope: string },
  authenticatedE2EESocket: boolean,
  server: Pick<
    RuntimeRpcMobilePairing,
    'createMobilePairingOffer' | 'getDeviceRegistry' | 'revokeMobileDevice'
  >
): WebMobilePairingContext | undefined {
  const issuerRevision = server.getDeviceRegistry()?.getDevice(device.deviceId)?.credentialRevision
  const authorizedEndpoint = (): string | null => {
    const policy = readWebMobilePairingPolicy()
    const current = server.getDeviceRegistry()?.getDevice(device.deviceId)
    return current &&
      current.credentialRevision === issuerRevision &&
      webMobilePairingAllowed(policy, current, authenticatedE2EESocket)
      ? policy.endpoint
      : null
  }
  if (!authorizedEndpoint()) {
    return undefined
  }
  const issued = (): readonly MobileRow[] =>
    (server.getDeviceRegistry()?.listDevices() ?? []).filter(
      (d) => d.scope === 'mobile' && d.createdByDeviceId === device.deviceId
    )
  return {
    endpoint: authorizedEndpoint,
    create: async (rotate) => {
      const endpoint = authorizedEndpoint()
      if (!endpoint) {
        return WEB_MOBILE_NOT_APPROVED
      }
      if (issued().filter((d) => d.lastSeenAt > 0).length >= 32) {
        return {
          available: false,
          guidance: 'Remove an unused phone before pairing another.'
        }
      }
      const offer = await server.createMobilePairingOffer(
        {
          address: endpoint,
          name: 'Phone',
          connectionMode: 'local-only',
          rotate,
          offerTtlMs: MOBILE_PAIRING_OFFER_TTL_MS,
          createdByDeviceId: device.deviceId
        },
        { preserveNetworkExposure: true }
      )
      if (!offer.available) {
        return offer
      }
      console.info('[pairing] Browser offered mobile access', {
        issuerDeviceId: device.deviceId,
        deviceId: offer.deviceId,
        expiresAt: offer.offerExpiresAt
      })
      const qr = await encodeMobilePairingQr(offer.pairingUrl)
      if (authorizedEndpoint() !== endpoint) {
        await server.revokeMobileDevice(offer.deviceId)
        return WEB_MOBILE_NOT_APPROVED
      }
      return {
        ...offer,
        qrDataUrl: qr.ok ? qr.qrDataUrl : null,
        qrSize: qr.ok ? qr.qrSize : null,
        ...(qr.ok ? {} : { qrError: qr.reason }),
        expiresAt: offer.offerExpiresAt
      }
    },
    devices: async () => ({
      devices: authorizedEndpoint()
        ? issued()
            .filter((d) => d.lastSeenAt > 0)
            .map(({ deviceId, name, pairedAt, lastSeenAt }) => ({
              deviceId,
              name,
              pairedAt,
              lastSeenAt
            }))
        : []
    }),
    revoke: async (deviceId) => ({
      revoked:
        !!authorizedEndpoint() &&
        issued().some((d) => d.deviceId === deviceId) &&
        (await server.revokeMobileDevice(deviceId))
    })
  }
}
