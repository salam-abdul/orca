import * as z from 'zod'
import type { MobilePairingConnectionMode } from './remote-runtime/pairing/mobile-pairing-connection-mode'

export const WEB_MOBILE_ENDPOINT = 'pairing.webMobile.endpoint'
export const WEB_MOBILE_CREATE = 'pairing.webMobile.create'
export const WEB_MOBILE_DEVICES = 'pairing.webMobile.devices'
export const WEB_MOBILE_REVOKE = 'pairing.webMobile.revoke'

export type WebMobilePairingUnavailable = { available: false; reason?: string; guidance?: string }
export type WebMobilePairingQR =
  | WebMobilePairingUnavailable
  | {
      available: true
      qrDataUrl: string | null
      qrSize: number | null
      qrError?: 'encoding_failed'
      pairingUrl: string
      endpoint: string | null
      deviceId: string
      connectionMode: MobilePairingConnectionMode
      expiresAt: number | null
    }
export type WebMobileDevice = {
  deviceId: string
  name: string
  pairedAt: number
  lastSeenAt: number
}

export const WEB_MOBILE_NOT_APPROVED: WebMobilePairingUnavailable = {
  available: false,
  reason: 'owner_approval_required',
  guidance: 'Phone pairing from this browser has not been enabled by the server owner.'
}

export const WebMobileEndpointParamsSchema = z.object({}).strict()
export const WebMobileCreateParamsSchema = z.object({ rotate: z.boolean().optional() }).strict()
export const WebMobileDevicesParamsSchema = z.object({}).strict()
export const WebMobileRevokeParamsSchema = z
  .object({ deviceId: z.string().min(1).max(128) })
  .strict()
