/**
 * [INPUT]: 依赖 noise/carrier 的密码与流量边界，以及既有 fragment/counter/lease 参数。
 * [OUTPUT]: 对外提供完整 Noise IK、密文内 carrier 帧、字节信用和既有纯逻辑 facade。
 * [POS]: remote 的平台无关核心；不依赖 React、Node、Netty、WebRTC 或 Typert。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const REMOTE_CORE_VERSION = 1 as const
export * from './noise.js'
export * from './carrier.js'
export * from './carrier-types.js'
export * from './carrier-tunnel.js'
export * from './secure-link.js'
export const MAX_FRAGMENT_BYTES = 16_384
export const MAX_REASSEMBLED_BYTES = 65_536

export type RemoteTransportKind = 'lan' | 'p2p' | 'turn' | 'relay'

export function selectRemoteTransport(
  available: readonly RemoteTransportKind[],
  preference: readonly RemoteTransportKind[] = ['lan', 'p2p', 'turn', 'relay'],
): RemoteTransportKind {
  for (const candidate of preference) if (available.includes(candidate)) return candidate
  throw new Error('no compatible remote transport')
}

export class RelayFramer {
  private sequence = 0

  next(linkId: string, payload: Uint8Array): { readonly v: 1; readonly kind: 'data'; readonly linkId: string; readonly seq: number; readonly payload: string } {
    if (payload.byteLength > MAX_REASSEMBLED_BYTES) throw new RangeError('relay payload is too large')
    let binary = ''
    for (const byte of payload) binary += String.fromCharCode(byte)
    return { v: 1, kind: 'data', linkId, seq: this.sequence++, payload: btoa(binary) }
  }
}

export type RemoteFragment = {
  readonly messageId: string
  readonly counter: number
  readonly index: number
  readonly total: number
  readonly payload: Uint8Array
}

export function fragmentMessage(messageId: string, counter: number, payload: Uint8Array, chunkSize = MAX_FRAGMENT_BYTES): RemoteFragment[] {
  if (!messageId || !Number.isSafeInteger(counter) || counter < 0) throw new TypeError('messageId and counter are invalid')
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_FRAGMENT_BYTES) throw new RangeError('chunkSize is invalid')
  if (payload.byteLength > MAX_REASSEMBLED_BYTES) throw new RangeError('payload is too large')
  const total = Math.max(1, Math.ceil(payload.byteLength / chunkSize))
  return Array.from({ length: total }, (_, index) => ({ messageId, counter, index, total, payload: payload.slice(index * chunkSize, (index + 1) * chunkSize) }))
}

export function reassembleFragments(fragments: readonly RemoteFragment[]): Uint8Array {
  if (fragments.length === 0) throw new TypeError('fragments are required')
  const first = fragments[0]!
  if (fragments.length !== first.total || fragments.some((fragment, index) => fragment.messageId !== first.messageId || fragment.counter !== first.counter || fragment.total !== first.total || fragment.index !== index)) throw new Error('fragment sequence is invalid')
  const size = fragments.reduce((sum, fragment) => sum + fragment.payload.byteLength, 0)
  if (size > MAX_REASSEMBLED_BYTES) throw new RangeError('reassembled payload is too large')
  const result = new Uint8Array(size)
  let offset = 0
  for (const fragment of fragments) { result.set(fragment.payload, offset); offset += fragment.payload.byteLength }
  return result
}

export class CounterWindow {
  private next = 0

  nextSend(): number {
    const counter = this.next
    this.next += 1
    return counter
  }

  accept(counter: number): void {
    if (!Number.isSafeInteger(counter) || counter < this.next) throw new Error('replayed or invalid counter')
    this.next = counter + 1
  }
}

export type LeaseState = 'IDLE' | 'ACTIVE' | 'REVOKED' | 'EXPIRED'

export function transitionLease(from: LeaseState, to: LeaseState): LeaseState {
  const allowed: Record<LeaseState, readonly LeaseState[]> = { IDLE: ['ACTIVE'], ACTIVE: ['ACTIVE', 'REVOKED', 'EXPIRED'], REVOKED: ['IDLE'], EXPIRED: ['IDLE'] }
  if (!allowed[from].includes(to)) throw new Error(`lease transition ${from} -> ${to} is invalid`)
  return to
}
