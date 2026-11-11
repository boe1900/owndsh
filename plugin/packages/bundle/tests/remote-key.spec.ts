/**
 * [INPUT]: 依赖官方 credentials 原子modifyRecord契约及真实Host密钥生成。
 * [OUTPUT]: 验证重启复用、公钥与私钥一致、用户/平台/installation隔离和损坏记录拒绝。
 * [POS]: remote 的静态身份回归，避免新进程静默换钥破坏ticket绑定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, it, expect } from 'vitest'
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { encodeKey } from '@owndsh/remote-core'
import { persistedHostKey } from '../src/remote/workspace-runtime.js'

class Store {
  readonly records = new Map<CredentialKey, CredentialRecord>()
  modifyRecord: CredentialProvider['modifyRecord'] = async (key, mutate) => {
    const value = await mutate(structuredClone(this.records.get(key)))
    if (value) this.records.set(key, structuredClone(value))
    return structuredClone(this.records.get(key))
  }
}
const owner = { platformUrl: 'https://own.example', userId: '1', deviceId: '2', installationId: 'install' }
describe('persistent Host key', () => {
  it('reuses one identity across runtime restarts and separates all owner dimensions', async () => {
    const store = new Store()
    const first = await persistedHostKey(store, owner)
    const publicKey = encodeKey(first.publicKey)
    first.secretKey.fill(0)
    expect(encodeKey((await persistedHostKey(store, owner)).publicKey)).toBe(publicKey)
    for (const alternative of [{ platformUrl: 'https://other.example' }, { userId: '2' }, { deviceId: '3' }, { installationId: 'other' }]) {
      expect(encodeKey((await persistedHostKey(store, { ...owner, ...alternative })).publicKey)).not.toBe(publicKey)
    }
    expect(store.records.size).toBe(5)
  })
  it('refuses a damaged record instead of silently rotating its key', async () => {
    const store = new Store()
    await persistedHostKey(store, owner)
    const key = [...store.records.keys()][0]!
    store.records.set(key, { kind: 'grant', payload: { version: 1, publicKey: 'invalid', secretKey: 'invalid' } })
    await expect(persistedHostKey(store, owner)).rejects.toThrow()
    expect(store.records.get(key)).toEqual({ kind: 'grant', payload: { version: 1, publicKey: 'invalid', secretKey: 'invalid' } })
  })
})
