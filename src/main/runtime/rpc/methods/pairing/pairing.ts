import {
  WEB_MOBILE_ENDPOINT,
  WEB_MOBILE_CREATE,
  WEB_MOBILE_DEVICES,
  WEB_MOBILE_REVOKE,
  WEB_MOBILE_NOT_APPROVED,
  WebMobileEndpointParamsSchema,
  WebMobileCreateParamsSchema,
  WebMobileDevicesParamsSchema,
  WebMobileRevokeParamsSchema
} from '../../../../../shared/web-mobile-pairing-contract'
import { defineMethod } from '../../core'
import {
  DECLARE_ORCA_ACCOUNT_METHOD,
  DeclareOrcaAccountParamsSchema
} from '../../../../../shared/remote-runtime/pairing/paired-desktop-account-contract'
import {
  pairedCreatorInstanceOfTerminal,
  pairedCreatorOfTerminal
} from '../../server/pairing/paired-terminal-creators'
import {
  DELEGATED_MOBILE_DEVICE_SYNC_METHOD,
  DelegatedMobileDeviceSyncParamsSchema
} from '../../../../../shared/remote-runtime/pairing/delegated-mobile-device-contract'
import {
  ORCAD_DECLARE_CLIENT_METHOD,
  ORCAD_PEER_DESKTOPS_METHOD,
  OrcadDeclareClientParamsSchema,
  OrcadPeerDesktopsParamsSchema
} from '../../../../../shared/remote-runtime/orcad-lifecycle/orcad-peer-desktops-contract'
import { RegisterDeviceKeyParamsSchema } from '../../../../../shared/remote-runtime/pairing/device-key-registration-contract'
import { REGISTER_DEVICE_KEY_METHOD } from '../../../../../shared/remote-runtime/pairing/device-key-capability'
import { EXCHANGE_PAIRING_TICKET_METHOD } from '../../../../../shared/remote-runtime/pairing/ticket-exchange-capability'
import { ExchangePairingTicketParamsSchema } from '../../../../../shared/remote-runtime/pairing/ticket-exchange-contract'
import {
  PairingGetEndpointsParamsSchema,
  PairingProvisionRelayParamsSchema
} from '../../../../../shared/remote-runtime/relay/mobile-relay-credential-contract'
import {
  PAIRING_CREATE_OFFER_METHOD,
  PairingCreateOfferParamsSchema
} from '../../../../../shared/remote-runtime/pairing/pairing-create-offer-contract'

export const PAIRING_METHODS = [
  // host-admin is necessary, but insufficient: the transport supplies this separate,
  // mobile-only capability only to owner-allowlisted encrypted runtime clients.
  defineMethod({
    name: WEB_MOBILE_ENDPOINT,
    permission: 'host-admin',
    params: WebMobileEndpointParamsSchema,
    handler: (_, ctx) => {
      const endpoint = ctx.webMobilePairing?.endpoint()
      return endpoint ? { available: true as const, endpoint } : WEB_MOBILE_NOT_APPROVED
    }
  }),
  defineMethod({
    name: WEB_MOBILE_CREATE,
    permission: 'host-admin',
    params: WebMobileCreateParamsSchema,
    handler: (params, ctx) =>
      ctx.webMobilePairing
        ? ctx.webMobilePairing.create(params.rotate === true)
        : WEB_MOBILE_NOT_APPROVED
  }),
  defineMethod({
    name: WEB_MOBILE_DEVICES,
    permission: 'host-admin',
    params: WebMobileDevicesParamsSchema,
    handler: (_, ctx) => ctx.webMobilePairing?.devices() ?? { devices: [] }
  }),
  defineMethod({
    name: WEB_MOBILE_REVOKE,
    permission: 'host-admin',
    params: WebMobileRevokeParamsSchema,
    handler: (params, ctx) => ctx.webMobilePairing?.revoke(params.deviceId) ?? { revoked: false }
  }),
  defineMethod({
    name: PAIRING_CREATE_OFFER_METHOD,
    // Only this host's owner CLI gets the context; paired clients and phones never hold pairing-admin.
    permission: 'pairing-admin',
    params: PairingCreateOfferParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairingOffers) {
        throw new Error('pairing_context_unavailable')
      }
      const { callerTerminalHandle, ...offer } = params
      return await ctx.pairingOffers.create(
        offer,
        pairedCreatorOfTerminal(callerTerminalHandle),
        pairedCreatorInstanceOfTerminal(callerTerminalHandle)
      )
    }
  }),
  defineMethod({
    name: 'pairing.getEndpoints',
    permission: 'pairing-admin',
    params: PairingGetEndpointsParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.getEndpoints(params)
    }
  }),
  defineMethod({
    name: 'pairing.provisionRelay',
    permission: 'pairing-admin',
    params: PairingProvisionRelayParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.provisionRelay(params)
    }
  }),
  defineMethod({
    name: REGISTER_DEVICE_KEY_METHOD,
    permission: 'device-self',
    params: RegisterDeviceKeyParamsSchema,
    handler: (params, ctx) => {
      if (!ctx.deviceSelf) {
        throw new Error('device_key_registration_unavailable')
      }
      return ctx.deviceSelf.registerDeviceKey(params)
    }
  }),
  defineMethod({
    name: DECLARE_ORCA_ACCOUNT_METHOD,
    permission: 'device-self',
    params: DeclareOrcaAccountParamsSchema,
    handler: (params, ctx) => {
      ctx.deviceSelf?.declareOrcaAccount(params.account, params.clientInstanceId)
      return {}
    }
  }),
  defineMethod({
    name: EXCHANGE_PAIRING_TICKET_METHOD,
    permission: 'device-self',
    params: ExchangePairingTicketParamsSchema,
    handler: (params, ctx) => {
      if (!ctx.deviceSelf) {
        throw new Error('pairing_ticket_exchange_unavailable')
      }
      return ctx.deviceSelf.exchangePairingTicket(params)
    }
  }),
  defineMethod({
    name: ORCAD_PEER_DESKTOPS_METHOD,
    // Paired desktops lack pairing-admin; they learn only other desktops' names, never credentials.
    permission: 'workspace',
    params: OrcadPeerDesktopsParamsSchema,
    handler: (params, ctx) => {
      if (!ctx.peerDesktops) {
        throw new Error('runtime_device_required')
      }
      return ctx.peerDesktops.list(params.clientInstanceId)
    }
  }),
  defineMethod({
    name: ORCAD_DECLARE_CLIENT_METHOD,
    permission: 'workspace',
    params: OrcadDeclareClientParamsSchema,
    handler: (params, ctx) => {
      if (!ctx.peerDesktops) {
        throw new Error('runtime_device_required')
      }
      ctx.peerDesktops.declare(params.clientInstanceId)
      return {}
    }
  }),
  defineMethod({
    name: DELEGATED_MOBILE_DEVICE_SYNC_METHOD,
    // Paired desktops lack pairing-admin but must manage their children within rpc-caller-scope.
    permission: 'workspace',
    params: DelegatedMobileDeviceSyncParamsSchema,
    handler: (params, ctx) => {
      if (!ctx.delegatedMobileDevices) {
        throw new Error('runtime_device_required')
      }
      return ctx.delegatedMobileDevices.sync(params.phones)
    }
  })
]
