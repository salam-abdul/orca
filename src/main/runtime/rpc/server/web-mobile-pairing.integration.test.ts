import '../dispatch/testing/unused-default-rpc-methods.test-fixture'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'
import { PAIRING_METHODS } from '../methods/pairing/pairing'
import { DeviceRegistry } from './pairing/device-registry'
import {
  encodePairingOffer,
  parsePairingCode
} from '../../../../shared/remote-runtime/pairing/pairing'
import {
  authenticateMobileWsSession,
  createEncryptedWsResponseReader,
  sendEncryptedWsRequest
} from './runtime-rpc-mobile-ws-test-harness'
import {
  WEB_MOBILE_ENDPOINT,
  WEB_MOBILE_CREATE,
  WEB_MOBILE_DEVICES,
  WEB_MOBILE_REVOKE
} from '../../../../shared/web-mobile-pairing-contract'

it('allows only the owner-approved encrypted runtime to issue and manage its own phone codes', async ({
  onTestFinished
}) => {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-web-mobile-'))
  const server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath,
    methods: PAIRING_METHODS,
    enableWebSocket: true,
    pinnedBindHost: '127.0.0.1',
    wsPort: 0
  })
  onTestFinished(async () => {
    await server.stop()
    vi.unstubAllEnvs()
    vi.useRealTimers()
    rmSync(userDataPath, { recursive: true, force: true })
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_795_003_200_000)
  vi.stubEnv('ORCA_WEB_MOBILE_PAIRING_ENDPOINT', 'wss://orca.example.test')
  vi.stubEnv('ORCA_WEB_MOBILE_PAIRING_CLIENT_IDS', '')
  await server.start()
  const ownerOffer = server.createPairingOffer({ scope: 'runtime', name: 'Browser test' })
  if (!ownerOffer.available) {
    throw new Error('Isolated runtime did not start')
  }
  const runtime = await authenticateMobileWsSession(ownerOffer.pairingUrl)
  const reader = createEncryptedWsResponseReader(runtime)
  let seq = 0
  const call = async (method: string, params = {}) => {
    const id = String(++seq)
    sendEncryptedWsRequest(runtime, { id, method, params })
    return reader.next(id)
  }
  try {
    const denied = await call(WEB_MOBILE_CREATE)
    expect(denied).toMatchObject({
      ok: true,
      result: { available: false, reason: 'owner_approval_required' }
    })
    const parent = parsePairingCode(ownerOffer.pairingUrl)!
    vi.stubEnv('ORCA_WEB_MOBILE_PAIRING_CLIENT_IDS', parent.pairedDeviceId!.toUpperCase())
    expect(await call(WEB_MOBILE_ENDPOINT)).toMatchObject({
      ok: true,
      result: { available: true, endpoint: 'wss://orca.example.test' }
    })
    expect(await call('pairing.createOffer', { scope: 'runtime' })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' }
    })
    expect(await call(WEB_MOBILE_CREATE, { scope: 'runtime' })).toMatchObject({ ok: false })
    const response = await call(WEB_MOBILE_CREATE)
    expect(response.ok).toBe(true)
    const qr = z
      .object({
        available: z.literal(true),
        deviceId: z.string(),
        pairingUrl: z.string(),
        qrDataUrl: z.string(),
        expiresAt: z.number()
      })
      .parse(response.result)
    expect(qr.available).toBe(true)
    expect(new URL(server.getWebSocketEndpoint()!).hostname).toBe('127.0.0.1')
    expect(qr.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true)
    const offer = parsePairingCode(qr.pairingUrl)!
    expect(offer.scope).toBe('mobile')
    expect(offer.endpoint).toBe('wss://orca.example.test')
    expect(qr.expiresAt).toBe(1_795_003_800_000)
    expect(await call(WEB_MOBILE_DEVICES)).toMatchObject({ ok: true, result: { devices: [] } })
    expect(new DeviceRegistry(userDataPath).getDevice(qr.deviceId)?.createdByDeviceId).toBe(
      parent.pairedDeviceId
    )
    const phone = await authenticateMobileWsSession(
      encodePairingOffer({ ...offer, endpoint: parent.endpoint })
    )
    const phoneReader = createEncryptedWsResponseReader(phone)
    try {
      sendEncryptedWsRequest(phone, { id: 'phone-denied', method: WEB_MOBILE_CREATE, params: {} })
      expect(await phoneReader.next('phone-denied')).toMatchObject({
        ok: false,
        error: { code: 'forbidden' }
      })
      const devices = await call(WEB_MOBILE_DEVICES)
      expect(devices).toMatchObject({
        ok: true,
        result: { devices: [{ deviceId: qr.deviceId, name: 'Phone' }] }
      })
      expect(JSON.stringify(devices)).not.toContain(offer.deviceToken)
      const keyedPhone = server
        .getDeviceRegistry()!
        .forkDeviceKey(qr.deviceId, Buffer.alloc(32, 7).toString('base64'), 'Migrated phone')
      expect(await call(WEB_MOBILE_DEVICES)).toMatchObject({
        ok: true,
        result: {
          devices: expect.arrayContaining([
            {
              deviceId: keyedPhone.deviceId,
              name: 'Migrated phone',
              pairedAt: 1_795_003_200_000,
              lastSeenAt: 1_795_003_200_000
            }
          ])
        }
      })
      expect(await call(WEB_MOBILE_REVOKE, { deviceId: keyedPhone.deviceId })).toMatchObject({
        ok: true,
        result: { revoked: true }
      })
      const unrelated = server.createPairingOffer({
        scope: 'mobile',
        name: 'Unrelated owner phone'
      })
      if (!unrelated.available) {
        throw new Error('Isolated owner invitation unavailable')
      }
      expect(await call(WEB_MOBILE_REVOKE, { deviceId: unrelated.deviceId })).toMatchObject({
        ok: true,
        result: { revoked: false }
      })
      expect(server.getDeviceRegistry()?.getDevice(unrelated.deviceId)).not.toBeNull()
      expect(await call(WEB_MOBILE_REVOKE, { deviceId: qr.deviceId })).toMatchObject({
        ok: true,
        result: { revoked: true }
      })
      expect(server.getDeviceRegistry()?.getDevice(qr.deviceId)).toBeNull()
      const next = await call(WEB_MOBILE_CREATE)
      const pending = z.object({ pairingUrl: z.string() }).parse(next.result)
      const pendingOffer = parsePairingCode(pending.pairingUrl)!
      vi.setSystemTime(1_795_003_800_001)
      expect(server.getDeviceRegistry()?.validateToken(pendingOffer.deviceToken)).toBeNull()
      vi.stubEnv('ORCA_WEB_MOBILE_PAIRING_CLIENT_IDS', '')
      expect(await call(WEB_MOBILE_CREATE)).toMatchObject({
        ok: true,
        result: { available: false, reason: 'owner_approval_required' }
      })
    } finally {
      phoneReader.dispose()
      phone.ws.close()
    }
  } finally {
    reader.dispose()
    runtime.ws.close()
  }
})
