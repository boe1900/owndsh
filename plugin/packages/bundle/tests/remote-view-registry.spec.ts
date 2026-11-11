/**
 * [INPUT]: 依赖真实 RemoteViewRegistry、协议设备/平台快照及可控连接生命周期。
 * [OUTPUT]: 验证重连先释放旧链路、失败可重试、新 view 不重用 URL、关闭页面取消迟到重连。
 * [POS]: remote document 所有权回归，不替代实际 Harness 联调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { it, expect, vi } from 'vitest'
import { zBootstrapSnapshot } from '@owndsh/platform-client'
import { zRemoteDevice } from '@owndsh/contracts'
import fixture from '../../../../contracts/fixtures/bootstrap-models-success.json'
import { RemoteViewRegistry } from '../src/remote/view-registry.js'
import type { RemoteDshLink, RemoteWorkspaceRuntime } from '../src/remote/workspace-runtime.js'

it('preserves a disconnected target after failed reconnect and rotates its view only on success', async () => {
  const device = zRemoteDevice.parse({ deviceId: '3', installationId: '123e4567-e89b-42d3-a456-426614174001', name: 'remote', platform: 'test', status: 'ACTIVE', online: true, remoteEnabled: true, capabilities: ['remote.connect'], capabilityRevision: 1, lastPresenceAt: null, revision: 1 })
  const lifetimes: AbortController[] = []
  let unavailable = false
  const runtime: RemoteWorkspaceRuntime = {
    start() {}, dispose() {}, setHostEnabled() {}, async devices() { return [device] },
    async connect(deviceId) {
      if (unavailable) throw new Error('offline')
      const lifetime = new AbortController()
      lifetimes.push(lifetime)
      return { id: String(lifetimes.length), linkId: String(lifetimes.length), deviceId, signal: lifetime.signal,
        async fetch() { return new Response() }, async openMux() { throw new Error('unused') }, close() { lifetime.abort() },
      } satisfies RemoteDshLink
    },
  }
  const unmount = vi.fn()
  const views = new RemoteViewRegistry(runtime, {
    status: () => ({ state: 'READY', bundleVersion: 'test', platformUrl: 'http://platform.example', transport: 'webServer.register' }),
    bootstrap: () => zBootstrapSnapshot.parse(fixture.data), subscribe: () => () => {},
  }, () => unmount)
  try {
    const old = await views.create('3', new AbortController().signal)
    unavailable = true
    await expect(views.reconnect(old.metadata.viewId, new AbortController().signal)).rejects.toThrow('offline')
    expect(lifetimes[0]?.signal.aborted).toBe(true)
    expect(views.get(old.metadata.viewId)).toBe(old)
    unavailable = false
    const next = await views.reconnect(old.metadata.viewId, new AbortController().signal)
    expect(next.metadata.deviceId).toBe('3')
    expect(next.metadata.viewId).not.toBe(old.metadata.viewId)
    expect(next.metadata.authority).toBe(old.metadata.authority)
    expect(views.get(old.metadata.viewId)).toBeUndefined()
    expect(views.get(next.metadata.viewId)).toBe(next)
  } finally { views.dispose() }
})
