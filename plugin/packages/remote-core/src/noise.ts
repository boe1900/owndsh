/**
 * [INPUT]: 依赖 MIT 授权 clatterjs 的完整 Noise IK 状态机及 noble X25519。
 * [OUTPUT]: 提供固定密码套件、双向身份绑定、两消息握手与严格顺序的加密会话。
 * [POS]: remote-core 的密码边界；业务载荷只有握手完成后才可进入 transport。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { NqHandshake, noiseIk, chachaPoly, sha256H, type TransportState } from '@lukeburns/clatterjs'
import { x25519 } from '@noble/curves/ed25519.js'

export const NOISE_PROTOCOL_NAME = 'Noise_IK_25519_ChaChaPoly_SHA256'
export const NOISE_PROLOGUE = 'owndsh.remote.v1'
export type NoiseKeyPair = { readonly secretKey: Uint8Array; readonly publicKey: Uint8Array }

export function generateNoiseKeyPair(secretKey?: Uint8Array): NoiseKeyPair {
  if (secretKey === undefined) return x25519.keygen()
  if (secretKey.length !== 32) throw new Error('ENT_REMOTE_INVALID_KEY')
  return { secretKey: secretKey.slice(), publicKey: x25519.getPublicKey(secretKey) }
}

export function encodeKey(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function decodeKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('ENT_REMOTE_INVALID_KEY')
  const result = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
  if (result.length !== 32 || encodeKey(result) !== value) throw new Error('ENT_REMOTE_INVALID_KEY')
  return result
}

export function createNoisePrologue(identity: {
  readonly linkId: string; readonly hostDeviceId: string; readonly controllerId: string
  readonly hostPublicKey: string; readonly controllerPublicKey: string
}): Uint8Array {
  decodeKey(identity.hostPublicKey)
  decodeKey(identity.controllerPublicKey)
  if (!identity.linkId || !identity.hostDeviceId || !identity.controllerId) throw new Error('ENT_REMOTE_INVALID_IDENTITY')
  return new TextEncoder().encode(JSON.stringify([NOISE_PROLOGUE, identity.linkId, identity.hostDeviceId,
    identity.controllerId, identity.hostPublicKey, identity.controllerPublicKey]))
}

export class NoiseSession {
  private handshake: NqHandshake | undefined
  private transport: TransportState | undefined
  private readonly local: NoiseKeyPair
  private readonly expectedRemote: Uint8Array
  private closed = false

  constructor(options: { readonly initiator: boolean; readonly local: NoiseKeyPair; readonly remote: Uint8Array;
    readonly prologue: Uint8Array; readonly random?: (length: number) => Uint8Array }) {
    this.local = generateNoiseKeyPair(options.local.secretKey)
    if (!equal(this.local.publicKey, options.local.publicKey) || options.remote.length !== 32) throw new Error('ENT_REMOTE_INVALID_KEY')
    this.expectedRemote = options.remote.slice()
    this.handshake = new NqHandshake(noiseIk(), { initiator: options.initiator, prologue: options.prologue.slice(),
      s: this.local, ...(options.initiator ? { rs: this.expectedRemote.slice() } : {}),
      cipher: chachaPoly, hash: sha256H,
      rng: options.random ?? (length => crypto.getRandomValues(new Uint8Array(length))) })
    if (this.handshake.getName() !== NOISE_PROTOCOL_NAME) throw new Error('ENT_REMOTE_NOISE_SUITE')
  }

  get complete(): boolean { return !this.closed && this.transport !== undefined }

  writeHandshake(payload = new Uint8Array()): Uint8Array {
    return this.step(true, payload)
  }

  readHandshake(message: Uint8Array): Uint8Array { return this.step(false, message) }

  encrypt(plaintext: Uint8Array): Uint8Array {
    const state = this.requireTransport()
    if (plaintext.length > 65_520) throw new Error('ENT_REMOTE_FRAME_LIMIT')
    return state.sendVec(plaintext)
  }

  decrypt(counter: number, ciphertext: Uint8Array): Uint8Array {
    try {
      const state = this.requireTransport()
      if (!Number.isSafeInteger(counter) || BigInt(counter) !== state.receivingNonce()) throw new Error('ENT_REMOTE_REPLAY')
      if (ciphertext.length > 65_536 || ciphertext.length < 16) throw new Error('ENT_REMOTE_FRAME_LIMIT')
      return state.receiveVec(ciphertext)
    } catch (error) { this.destroy(); throw error }
  }

  sendingCounter(): number {
    const counter = this.requireTransport().sendingNonce()
    if (counter >= BigInt(Number.MAX_SAFE_INTEGER)) { this.destroy(); throw new Error('ENT_REMOTE_COUNTER_EXHAUSTED') }
    return Number(counter)
  }

  destroy(): void {
    this.closed = true
    this.local.secretKey.fill(0)
    this.expectedRemote.fill(0)
    // 提供者尚无擦除内部派生密钥的公开 API；销毁所有可调用入口并释放所有者。
    this.handshake = undefined
    this.transport = undefined
  }

  private requireTransport(): TransportState {
    if (this.closed || this.transport === undefined) throw new Error('ENT_REMOTE_NOT_SECURE')
    return this.transport
  }

  private step(writing: boolean, value: Uint8Array): Uint8Array {
    try {
      const state = this.handshake
      if (this.closed || state === undefined || this.complete || state.isWriteTurn() !== writing) throw new Error('ENT_REMOTE_HANDSHAKE_ORDER')
      if (value.length > 4096) throw new Error('ENT_REMOTE_FRAME_LIMIT')
      const output = new Uint8Array(value.length + (writing ? state.getNextMessageOverhead() : 0))
      const length = writing ? state.writeMessage(value, output) : state.readMessage(value, output)
      if (!writing || state.isFinished()) {
        const actual = state.getRemoteStatic()
        if (actual === undefined || !equal(actual, this.expectedRemote)) throw new Error('ENT_REMOTE_PEER_KEY')
      }
      if (state.isFinished()) {
        this.transport = state.finalize()
        this.handshake = undefined
        this.local.secretKey.fill(0)
      }
      return output.slice(0, length)
    } catch (error) { this.destroy(); throw error }
  }
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index]! ^ right[index]!
  return difference === 0
}
