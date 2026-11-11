/**
 * [INPUT]: 依赖产品WorkspaceRuntime、真实密钥持久化和异步hello控制面。
 * [OUTPUT]: 验证默认关闭、显式开启、稳定公钥、关闭只影响Host与销毁清理。
 * [POS]: remote opt-in与presence生命周期回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { it, expect, vi } from 'vitest'
import { enterpriseProtocolSha256 } from '@owndsh/contracts'
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { EnterprisePlatformStatus } from '@owndsh/platform-client'
import { WorkspaceRuntime } from '../src/remote/workspace-runtime.js'
import { remoteFrameId } from '../src/remote/secure-link.js'
import type { RemoteSocketLike } from '../src/remote/server-connection.js'

it('keeps Host off by default, preserves identity across explicit re-enable and disposes presence', async () => {
  const records = new Map<CredentialKey, CredentialRecord>()
  const credentials: Pick<CredentialProvider, 'modifyRecord'> = {
    async modifyRecord(key, mutate) { const next = await mutate(records.get(key)); if (next) records.set(key, structuredClone(next)); return records.get(key) },
  }
  const frames: unknown[] = []
  const sockets: RemoteSocketLike[] = []
  const closed = vi.fn()
  const factory = { open: async () => {
    let receive: ((event: { data?: unknown }) => void) | undefined
    const socket: RemoteSocketLike = {
      close: closed,
      addEventListener(type, listener) { if (type === 'message') receive = listener },
      send(data) {
        const frame = JSON.parse(data)
        frames.push(frame)
        if (frame.type === 'hello') queueMicrotask(() => receive?.({ data: JSON.stringify({ v: 1, type: 'hello.ack', id: remoteFrameId(), ts: Date.now(), payload: { peerRole: 'host', protocolSha256: enterpriseProtocolSha256 } }) }))
      },
    }
    sockets.push(socket)
    return socket
  } }
  let notify: ((status: EnterprisePlatformStatus) => void) | undefined
  let status: EnterprisePlatformStatus = { state: 'READY', bundleVersion: 'test', platformUrl: 'https://own.example', transport: 'webServer.register' }
  const platform = {
    status: () => status,
    bootstrap: () => ({ user: { id: '1' } }),
    subscribe(listener: (value: EnterprisePlatformStatus) => void) { notify = listener; return () => { notify = undefined } },
    async remoteSession() { return { platformUrl: 'https://own.example', accessToken: 'private', deviceId: '2', installationId: 'installation' } },
    async request() { throw new Error('unused') },
    markDeviceRevoked() { status = { ...status, state: 'DEVICE_REVOKED' }; notify?.(status) },
  }
  const runtime = new WorkspaceRuntime({ credentials, connection: { authenticatedUrl: value => value }, webServer: { getOrigin: () => 'http://127.0.0.1' }, workspaceRegistry: { list: () => [] } }, platform, factory)
  try {
    runtime.start()
    await new Promise(resolve => setTimeout(resolve, 1))
    expect(sockets).toHaveLength(0)
    runtime.setHostEnabled(true)
    await vi.waitFor(() => expect(frames).toHaveLength(2))
    expect(sockets).toHaveLength(1)
    runtime.setHostEnabled(false)
    expect(closed).toHaveBeenCalledOnce()
    runtime.setHostEnabled(true)
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    expect(records.size).toBe(1)
    platform.markDeviceRevoked()
    expect(closed).toHaveBeenCalledTimes(2)
  } finally { runtime.dispose() }
})
