/**
 * [INPUT]: 依赖产品WorkspaceRuntime、真实密钥持久化和异步hello控制面。
 * [OUTPUT]: 验证默认关闭、显式开启、稳定公钥、关闭只影响Host、分页完整性及建链拒绝原因保留。
 * [POS]: remote opt-in与presence生命周期回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { it, expect, vi } from 'vitest'
import { enterpriseProtocolSha256, type RemoteDevice } from '@owndsh/contracts'
import { encodeKey, generateNoiseKeyPair } from '@owndsh/remote-core'
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

it('loads later device pages and rejects truncated or cyclic directories', async () => {
  const device = (id: string): RemoteDevice => ({ deviceId: id, installationId: '11111111-1111-4111-8111-111111111111',
    name: `Device ${id}`, platform: 'web', status: 'ACTIVE', online: true, remoteEnabled: true,
    capabilities: ['remote.connect'], capabilityRevision: 1, revision: 1, lastPresenceAt: null })
  let cycle = false
  const paths: string[] = []
  const runtime = new WorkspaceRuntime({
    credentials: { async modifyRecord() { throw new Error('unused') } },
    connection: { authenticatedUrl: value => value }, webServer: { getOrigin: () => 'http://127.0.0.1' }, workspaceRegistry: { list: () => [] },
  }, {
    status: () => ({ state: 'READY', bundleVersion: 'test', transport: 'webServer.register' }),
    bootstrap: () => ({ user: { id: '1' } }), subscribe: () => () => {}, markDeviceRevoked() {},
    async remoteSession() { throw new Error('unused') },
    async request(path) {
      paths.push(path)
      const second = new URL(path, 'http://localhost').searchParams.has('cursor')
      return Response.json({ data: { items: [device(second ? '3' : '2')],
        page: { hasMore: !second || cycle, limit: 100, nextCursor: !second || cycle ? 'next-cursor-for-test' : null } },
      requestId: 'req_01ARZ3NDEKTSV4RRFFQ69G5FAV' })
    },
  }, { async open() { throw new Error('unused') } })
  try {
    expect((await runtime.devices()).map(item => item.deviceId)).toEqual(['2', '3'])
    expect(paths).toEqual(['/enterprise/api/v1/remote/devices?limit=100', '/enterprise/api/v1/remote/devices?limit=100&cursor=next-cursor-for-test'])
    cycle = true
    await expect(runtime.devices()).rejects.toThrow('ENT_REMOTE_PROTOCOL')
  } finally { runtime.dispose() }
})

it.each(['error', 'connect.reject'])('preserves the busy reason from a %s control frame and releases the rejected socket', async type => {
  const linkId = remoteFrameId('rln')
  const closed = vi.fn()
  const runtime = new WorkspaceRuntime({
    credentials: { async modifyRecord() { throw new Error('unused') } },
    connection: { authenticatedUrl: value => value }, webServer: { getOrigin: () => 'http://127.0.0.1' }, workspaceRegistry: { list: () => [] },
  }, {
    status: () => ({ state: 'READY', bundleVersion: 'test', transport: 'webServer.register' }),
    bootstrap: () => ({ user: { id: '1' } }), subscribe: () => () => {}, markDeviceRevoked() {},
    async remoteSession() { return { platformUrl: 'https://own.example', accessToken: 'test-only', deviceId: '2', installationId: 'installation' } },
    async request() { return Response.json({ data: {
      ticket: 'test-only-ticket'.repeat(3), linkId, deviceId: '3', expiresAt: new Date(Date.now() + 60_000).toISOString(),
      iceServers: [], hostPublicKey: encodeKey(generateNoiseKeyPair().publicKey),
    }, requestId: 'req_01ARZ3NDEKTSV4RRFFQ69G5FAV' }) },
  }, { async open() {
    let receive: ((event: { data?: unknown }) => void) | undefined
    return {
      close: closed,
      addEventListener(event, listener) { if (event === 'message') receive = listener },
      send(data) {
        const frame = JSON.parse(data)
        const payload = frame.type === 'hello'
          ? { peerRole: 'controller', protocolSha256: enterpriseProtocolSha256 }
          : type === 'error' ? { code: 'ENT_REMOTE_BUSY', message: 'private server diagnostic' } : { linkId, code: 'ENT_REMOTE_BUSY' }
        if (frame.type === 'hello' || frame.type === 'connect.request') queueMicrotask(() => receive?.({ data: JSON.stringify({
          v: 1, type: frame.type === 'hello' ? 'hello.ack' : type, id: remoteFrameId(), ts: Date.now(), payload,
        }) }))
      },
    }
  } })
  try {
    await expect(runtime.connect('3')).rejects.toThrow('ENT_REMOTE_BUSY')
    expect(closed).toHaveBeenCalledOnce()
  } finally { runtime.dispose() }
})
