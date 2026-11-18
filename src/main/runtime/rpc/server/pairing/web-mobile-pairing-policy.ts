/** Owner opt-in for mobile-only pairing; existing pairing-admin permissions remain unchanged. */
export type WebMobilePairingPolicy = { endpoint: string; allowedDeviceIds: readonly string[] }

export function readWebMobilePairingPolicy(
  env: Record<string, string | undefined> = process.env
): WebMobilePairingPolicy | null {
  const endpoint = env.ORCA_WEB_MOBILE_PAIRING_ENDPOINT
  const ids = env.ORCA_WEB_MOBILE_PAIRING_CLIENT_IDS
  if (!endpoint || !ids) {
    return null
  }
  try {
    const url = new URL(endpoint)
    if (
      url.protocol !== 'wss:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !url.hostname
    ) {
      return null
    }
    const allowedDeviceIds = ids.split(',').map((id) => id.trim().toLowerCase())
    if (
      !allowedDeviceIds.length ||
      allowedDeviceIds.length > 16 ||
      allowedDeviceIds.some(
        (id) => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
      )
    ) {
      return null
    }
    return { endpoint: url.origin, allowedDeviceIds }
  } catch {
    return null
  }
}

export function webMobilePairingAllowed(
  policy: WebMobilePairingPolicy | null,
  authenticatedDevice: { deviceId: string; scope: string },
  authenticatedE2EESocket: boolean
): policy is WebMobilePairingPolicy {
  return (
    !!policy &&
    authenticatedE2EESocket &&
    authenticatedDevice.scope === 'runtime' &&
    policy.allowedDeviceIds.includes(authenticatedDevice.deviceId.toLowerCase())
  )
}
