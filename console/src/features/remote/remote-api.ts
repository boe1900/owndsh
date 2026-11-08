/**
 * [INPUT]: 依赖 enterprise-admin HttpOnly Cookie、Remote OpenAPI P0 路径和浏览器 URL。
 * [OUTPUT]: 对外提供 Remote device/ticket DTO、同源请求、controller X25519 identity 和 WebSocket URL 派生。
 * [POS]: features/remote 的网络边界；私钥只保留在当前页面进程，不写入存储或请求正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export type RemoteDevice = {
  deviceId: string
  installationId: string
  name: string
  platform: string
  status: 'ACTIVE' | 'REVOKED' | 'OFFLINE'
  online: boolean
  remoteEnabled: boolean
  capabilities: string[]
  transports?: Array<'lan' | 'p2p' | 'turn' | 'relay'>
  capabilityRevision: number
  lastPresenceAt: string | null
  revision: number
}

export type RemoteTicket = {
  ticket: string
  linkId: string
  deviceId: string
  expiresAt: string
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>
}

export type ControllerIdentity = { controllerDeviceId: string; controllerPublicKey: string; privateKey: CryptoKey }
let identityPromise: Promise<ControllerIdentity> | undefined

type Envelope<T> = { data: T; requestId: string }

async function remoteFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, credentials: 'include', headers: { accept: 'application/json', ...init?.headers } })
  const body = await response.json() as unknown
  if (!response.ok) {
    const code = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null && 'code' in body.error ? String(body.error.code) : 'ENT_PLATFORM_UNAVAILABLE'
    throw new Error(code)
  }
  return (body as Envelope<T>).data
}

export async function listRemoteDevices(signal?: AbortSignal): Promise<RemoteDevice[]> {
  const page = await remoteFetch<{ items: RemoteDevice[] }>(`/enterprise/admin/v1/remote/devices?limit=100`, { signal })
  return page.items
}

export async function createRemoteTicket(deviceId: string, signal?: AbortSignal): Promise<RemoteTicket> {
  const identity = await controllerIdentity()
  return remoteFetch<RemoteTicket>(`/enterprise/admin/v1/remote/devices/${encodeURIComponent(deviceId)}/ticket`, {
    method: 'POST',
    signal,
    headers: { 'idempotency-key': crypto.randomUUID(), 'content-type': 'application/json' },
    body: JSON.stringify({
      controllerDeviceId: identity.controllerDeviceId,
      controllerPublicKey: identity.controllerPublicKey,
      requestedCapabilities: ['remote.connect', 'host.describe'],
      clientVersion: 'owndsh-console/0.1.0',
    }),
  })
}

export async function controllerIdentity(): Promise<ControllerIdentity> {
  identityPromise ??= (async () => {
    const subtle = crypto.subtle as SubtleCrypto & { generateKey(algorithm: unknown, extractable: boolean, keyUsages: readonly string[]): Promise<CryptoKeyPair> }
    const keyPair = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']) as CryptoKeyPair
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
    return { controllerDeviceId: `ctl_${ulid()}`, controllerPublicKey: base64Url(raw), privateKey: keyPair.privateKey }
  })().catch(error => {
    identityPromise = undefined
    throw new Error(error instanceof Error ? 'ENT_REMOTE_IDENTITY_UNSUPPORTED' : 'ENT_REMOTE_IDENTITY_UNSUPPORTED')
  })
  return identityPromise
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function ulid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from({ length: 26 }, (_, index) => alphabet[bytes[index % bytes.length] & 31]).join('')
}

export function remoteWebSocketUrl(origin = window.location.origin): string {
  const url = new URL('/remote/ws/v1', origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
