/**
 * [INPUT]: 依赖 Remote core 纯函数和固定 Noise 参数。
 * [OUTPUT]: 验证 fragment/reassembly、counter replay guard、lease state machine 和协议参数。
 * [POS]: remote-core 的平台无关行为回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CounterWindow, fragmentMessage, generateNoiseKeyPair, NoiseIkInitiator, NoiseIkResponder, NOISE_PROLOGUE, NOISE_PROTOCOL_NAME, RelayFramer, reassembleFragments, selectRemoteTransport, transitionLease } from '../src/index.js'

describe('remote core', () => {
  it('round trips bounded fragments', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5])
    expect(reassembleFragments(fragmentMessage('m', 3, original, 2))).toEqual(original)
  })

  it('rejects replay and invalid lease transitions', () => {
    const counter = new CounterWindow()
    counter.accept(0)
    expect(() => counter.accept(0)).toThrow()
    expect(() => transitionLease('IDLE', 'REVOKED')).toThrow()
  })

  it('freezes the Noise parameters', () => {
    expect(NOISE_PROTOCOL_NAME).toBe('Noise_IK_25519_ChaChaPoly_SHA256')
    expect(NOISE_PROLOGUE).toBe('owndsh.remote.v1')
  })

  it('performs an authenticated Noise IK handshake and rejects replay', () => {
    const responder = generateNoiseKeyPair()
    const initiator = generateNoiseKeyPair()
    const message = new NoiseIkInitiator(initiator, responder.publicKey).start(new Uint8Array([7, 8])).message
    const accepted = new NoiseIkResponder(responder, initiator.publicKey).accept(message)
    expect(accepted.payload).toEqual(new Uint8Array([7, 8]))
    const second = new NoiseIkInitiator(initiator, responder.publicKey).start(new Uint8Array([1]))
    const encrypted = second.transport.encrypt(new Uint8Array([2, 3]))
    const receiver = new NoiseIkResponder(responder, initiator.publicKey).accept(second.message).transport
    expect(receiver.decrypt(encrypted.counter, encrypted.ciphertext)).toEqual(new Uint8Array([2, 3]))
    expect(() => receiver.decrypt(encrypted.counter, encrypted.ciphertext)).toThrow()
  })

  it('matches the committed deterministic Noise vector', () => {
    const vector = JSON.parse(readFileSync(new URL('../../../../contracts/remote/crypto-vectors.json', import.meta.url), 'utf8')).vectors[0]
    const decode = (value: string) => Uint8Array.from(Buffer.from(value, 'base64'))
    const responder = { secretKey: decode(vector.responderSecretKey), publicKey: decode(vector.responderPublicKey) }
    const initiator = { secretKey: decode(vector.initiatorSecretKey), publicKey: decode(vector.initiatorPublicKey) }
    const started = new NoiseIkInitiator(initiator, responder.publicKey).start(
      decode(vector.handshakePayload), decode(vector.ephemeralSecretKey),
    )
    expect(Buffer.from(started.message).toString('base64')).toBe(vector.handshakeMessage)
    const accepted = new NoiseIkResponder(responder, initiator.publicKey).accept(started.message)
    expect(accepted.payload).toEqual(decode(vector.handshakePayload))
    const encrypted = started.transport.encrypt(decode(vector.plaintext))
    expect(encrypted.counter).toBe(vector.counter)
    expect(Buffer.from(encrypted.ciphertext).toString('base64')).toBe(vector.ciphertext)
    expect(accepted.transport.decrypt(encrypted.counter, encrypted.ciphertext)).toEqual(decode(vector.plaintext))
  })

  it('selects the first available transport and bounds relay frames', () => {
    expect(selectRemoteTransport(['relay', 'turn'])).toBe('turn')
    const frame = new RelayFramer().next('rln_01ARZ3NDEKTSV4RRFFQ69G5FAV', new Uint8Array([1, 2]))
    expect(frame.seq).toBe(0)
    expect(() => new RelayFramer().next('link', new Uint8Array(65_537))).toThrow()
  })
})
