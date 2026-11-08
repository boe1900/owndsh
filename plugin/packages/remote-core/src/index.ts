/**
 * [INPUT]: 依赖 Remote v1 的 Noise/fragment/counter/lease 冻结参数。
 * [OUTPUT]: 对外提供跨 Host/Web 共用的无框架 core 类型和纯函数。
 * [POS]: remote 的平台无关核心；不依赖 React、Node、Netty、WebRTC 或 Typert。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const REMOTE_CORE_VERSION = 1 as const
export const NOISE_PROTOCOL_NAME = 'Noise_IK_25519_ChaChaPoly_SHA256' as const
export const NOISE_PROLOGUE = 'owndsh.remote.v1' as const
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

export type NoiseKeyPair = { readonly secretKey: Uint8Array; readonly publicKey: Uint8Array }

export function generateNoiseKeyPair(): NoiseKeyPair {
  const { x25519 } = requireNoiseCurves()
  const pair = x25519.keygen()
  return { secretKey: pair.secretKey, publicKey: pair.publicKey }
}

export type NoiseHandshakeResult = {
  readonly message: Uint8Array
  readonly transport: NoiseTransport
}

export class NoiseTransport {
  private sendCounter = 0
  private receiveCounter = 0

  constructor(private readonly sendKey: Uint8Array, private readonly receiveKey: Uint8Array, private readonly handshakeHash: Uint8Array) {}

  encrypt(plaintext: Uint8Array): { readonly counter: number; readonly ciphertext: Uint8Array } {
    const counter = this.sendCounter++
    return { counter, ciphertext: noiseCipher(this.sendKey, counter, plaintext, this.handshakeHash, false) }
  }

  decrypt(counter: number, ciphertext: Uint8Array): Uint8Array {
    if (!Number.isSafeInteger(counter) || counter !== this.receiveCounter) throw new Error('Noise counter is replayed or out of order')
    const plaintext = noiseCipher(this.receiveKey, counter, ciphertext, this.handshakeHash, true)
    this.receiveCounter++
    return plaintext
  }
}

export class NoiseIkInitiator {
  constructor(
    private readonly staticKey: NoiseKeyPair,
    private readonly responderStaticPublicKey: Uint8Array,
    private readonly prologue: Uint8Array = new TextEncoder().encode(NOISE_PROLOGUE),
  ) {}

  start(payload: Uint8Array = new Uint8Array(), ephemeralSecretKey?: Uint8Array): NoiseHandshakeResult {
    const { x25519 } = requireNoiseCurves()
    const state = noiseState(this.prologue)
    const ephemeral = ephemeralSecretKey === undefined
      ? x25519.keygen()
      : { secretKey: validateNoiseSecret(ephemeralSecretKey), publicKey: x25519.getPublicKey(ephemeralSecretKey) }
    state.mixHash(ephemeral.publicKey)
    state.mixKey(x25519.getSharedSecret(ephemeral.secretKey, this.responderStaticPublicKey))
    const encryptedStatic = state.encryptAndHash(this.staticKey.publicKey)
    state.mixKey(x25519.getSharedSecret(this.staticKey.secretKey, this.responderStaticPublicKey))
    const encryptedPayload = state.encryptAndHash(payload)
    const transport = state.split(false)
    return { message: concat(ephemeral.publicKey, encryptedStatic, encryptedPayload), transport }
  }
}

export class NoiseIkResponder {
  constructor(
    private readonly staticKey: NoiseKeyPair,
    private readonly initiatorStaticPublicKey: Uint8Array,
    private readonly prologue: Uint8Array = new TextEncoder().encode(NOISE_PROLOGUE),
  ) {}

  accept(message: Uint8Array): { readonly payload: Uint8Array; readonly transport: NoiseTransport } {
    const { x25519 } = requireNoiseCurves()
    if (message.byteLength < 32 + 48) throw new Error('Noise handshake message is too short')
    const state = noiseState(this.prologue)
    const ephemeral = message.slice(0, 32)
    let offset = 32
    state.mixHash(ephemeral)
    state.mixKey(x25519.getSharedSecret(this.staticKey.secretKey, ephemeral))
    const encryptedStatic = message.slice(offset, offset + 48)
    offset += encryptedStatic.byteLength
    const initiatorStatic = state.decryptAndHash(encryptedStatic)
    if (!equal(initiatorStatic, this.initiatorStaticPublicKey)) throw new Error('Noise initiator static key mismatch')
    state.mixKey(x25519.getSharedSecret(this.staticKey.secretKey, initiatorStatic))
    const payload = state.decryptAndHash(message.slice(offset))
    return { payload, transport: state.split(true) }
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

type NoiseState = {
  mixHash(value: Uint8Array): void
  mixKey(value: Uint8Array): void
  encryptAndHash(value: Uint8Array): Uint8Array
  decryptAndHash(value: Uint8Array): Uint8Array
  split(responder: boolean): NoiseTransport
}

function noiseState(prologue: Uint8Array): NoiseState {
  let hash = sha256(new TextEncoder().encode(NOISE_PROTOCOL_NAME))
  if (prologue.byteLength > 0) hash = sha256(concat(hash, prologue))
  let chainingKey = hash
  let key: Uint8Array | undefined
  let nonce = 0
  return {
    mixHash(value) { hash = sha256(concat(hash, value)) },
    mixKey(value) {
      const derived = hkdf(chainingKey, value, new Uint8Array(), 64)
      chainingKey = derived.slice(0, 32)
      key = derived.slice(32, 64)
      nonce = 0
    },
    encryptAndHash(value) {
      if (key === undefined) { hash = sha256(concat(hash, value)); return value.slice() }
      const encrypted = noiseCipher(key, nonce++, value, hash, false)
      hash = sha256(concat(hash, encrypted))
      return encrypted
    },
    decryptAndHash(value) {
      if (key === undefined) { hash = sha256(concat(hash, value)); return value.slice() }
      const plain = noiseCipher(key, nonce++, value, hash, true)
      hash = sha256(concat(hash, value))
      return plain
    },
    split(responder) {
      const derived = hkdf(chainingKey, new Uint8Array(), new Uint8Array(), 64)
      return responder
        ? new NoiseTransport(derived.slice(32, 64), derived.slice(0, 32), hash)
        : new NoiseTransport(derived.slice(0, 32), derived.slice(32, 64), hash)
    },
  }
}

function noiseCipher(key: Uint8Array, counter: number, input: Uint8Array, aad: Uint8Array, decrypt: boolean): Uint8Array {
  const { chacha20poly1305 } = requireNoiseCiphers()
  const nonce = new Uint8Array(12)
  new DataView(nonce.buffer).setBigUint64(4, BigInt(counter), true)
  const cipher = chacha20poly1305(key, nonce, aad)
  return decrypt ? cipher.decrypt(input) : cipher.encrypt(input)
}

function hkdf(chainingKey: Uint8Array, input: Uint8Array, salt: Uint8Array, length: number): Uint8Array {
  const { extract, expand } = requireNoiseHkdf()
  return expand(noiseHash.sha256, extract(noiseHash.sha256, input, chainingKey), new Uint8Array(), length)
}

function sha256(value: Uint8Array): Uint8Array {
  return requireNoiseHash().sha256(value)
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.byteLength }
  return result
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

function validateNoiseSecret(value: Uint8Array): Uint8Array {
  if (value.byteLength !== 32) throw new RangeError('Noise secret key must be 32 bytes')
  return value.slice()
}

function requireNoiseCurves(): typeof import('@noble/curves/ed25519.js') { return noiseCurves }
function requireNoiseCiphers(): typeof import('@noble/ciphers/chacha.js') { return noiseCiphers }
function requireNoiseHkdf(): typeof import('@noble/hashes/hkdf.js') { return noiseHkdf }
function requireNoiseHash(): typeof import('@noble/hashes/sha2.js') { return noiseHash }

import * as noiseCurves from '@noble/curves/ed25519.js'
import * as noiseCiphers from '@noble/ciphers/chacha.js'
import * as noiseHkdf from '@noble/hashes/hkdf.js'
import * as noiseHash from '@noble/hashes/sha2.js'
