/**
 * [INPUT]: 依赖 Remote core 纯函数和固定 Noise 参数。
 * [OUTPUT]: 验证 fragment/reassembly、counter replay guard、lease state machine 和协议参数。
 * [POS]: remote-core 的平台无关行为回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest'
import { CounterWindow, fragmentMessage, NOISE_PROLOGUE, NOISE_PROTOCOL_NAME, RelayFramer, reassembleFragments, selectRemoteTransport, transitionLease } from '../src/index.js'

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

  it('selects the first available transport and bounds relay frames', () => {
    expect(selectRemoteTransport(['relay', 'turn'])).toBe('turn')
    const frame = new RelayFramer().next('rln_01ARZ3NDEKTSV4RRFFQ69G5FAV', new Uint8Array([1, 2]))
    expect(frame.seq).toBe(0)
    expect(() => new RelayFramer().next('link', new Uint8Array(65_537))).toThrow()
  })
})
