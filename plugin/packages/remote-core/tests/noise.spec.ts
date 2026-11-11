/**
 * [INPUT]: 依赖 noise-c 独立公开 IK 向量和实际 clatterjs 会话。
 * [OUTPUT]: 验证两消息互操作、身份/序列绑定、篡改与重放拒绝。
 * [POS]: remote-core 的独立密码学验收；fixture 不由被测代码生成。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, it, expect } from 'vitest'
import vector from '../../../../contracts/remote/crypto-vectors.json'
import { NoiseSession, generateNoiseKeyPair, createNoisePrologue, encodeKey } from '../src/noise.js'
const decode = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))
function sessions(prologue = decode(vector.init_prologue)) {
  const initiator = generateNoiseKeyPair(decode(vector.init_static))
  const responder = generateNoiseKeyPair(decode(vector.resp_static))
  return [new NoiseSession({ initiator: true, local: initiator, remote: responder.publicKey, prologue,
    random: () => decode(vector.init_ephemeral) }),
  new NoiseSession({ initiator: false, local: responder, remote: initiator.publicKey, prologue: decode(vector.resp_prologue),
    random: () => decode(vector.resp_ephemeral) })] as const
}
describe('Noise IK / noise-c published vector', () => {
  it('matches both handshake messages and all transport ciphertexts', () => {
    const [initiator, responder] = sessions()
    for (const [index, message] of vector.messages.entries()) {
      const source = index % 2 === 0 ? initiator : responder
      const target = index % 2 === 0 ? responder : initiator
      const bytes = decode(message.payload)
      if (index < 2) {
        const wire = source.writeHandshake(bytes)
        expect(Buffer.from(wire).toString('hex')).toBe(message.ciphertext)
        expect(target.readHandshake(wire)).toEqual(bytes)
        if (index === 0) { expect(initiator.complete).toBe(false); expect(responder.complete).toBe(false) }
      } else {
        const counter = source.sendingCounter()
        const wire = source.encrypt(bytes)
        expect(Buffer.from(wire).toString('hex')).toBe(message.ciphertext)
        expect(target.decrypt(counter, wire)).toEqual(bytes)
      }
    }
  })
  it('closes on wrong prologue, wrong step, corruption and replay', () => {
    const [wrong, host] = sessions(new Uint8Array([1]))
    expect(() => host.readHandshake(wrong.writeHandshake())).toThrow()
    const [order] = sessions(); expect(() => order.readHandshake(new Uint8Array())).toThrow()
    const [client, server] = sessions()
    server.readHandshake(client.writeHandshake()); client.readHandshake(server.writeHandshake())
    const wire = client.encrypt(new Uint8Array([1]))
    expect(server.decrypt(0, wire)).toEqual(new Uint8Array([1]))
    expect(() => server.decrypt(0, wire)).toThrow()
    expect(server.complete).toBe(false)
    const [a, b] = sessions(); b.readHandshake(a.writeHandshake()); a.readHandshake(b.writeHandshake())
    const corrupt = a.encrypt(new Uint8Array([1])); corrupt[0] = corrupt[0]! ^ 1
    expect(() => b.decrypt(0, corrupt)).toThrow()
  })
  it('binds the enterprise link and both canonical keys', () => {
    const key = encodeKey(generateNoiseKeyPair().publicKey)
    const value = { linkId: 'link', hostDeviceId: '1', controllerId: 'ctl', hostPublicKey: key, controllerPublicKey: key }
    expect(new TextDecoder().decode(createNoisePrologue(value))).toBe(JSON.stringify(['owndsh.remote.v1', 'link', '1', 'ctl', key, key]))
    expect(() => createNoisePrologue({ ...value, hostPublicKey: key + '=' })).toThrow()
  })
})
