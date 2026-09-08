/**
 * [INPUT]: 依赖 EnterpriseAccountStore、local-api 端口和可控请求与时钟
 * [OUTPUT]: 验证订阅生命周期、地址/账号/卸载动作、连接 revision 去重加载、V1 Session 停用与错误投影
 * [POS]: dsh-ui 账号状态控制器测试，覆盖三个官方 slot 共享的行为真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import { EnterpriseAccountStore } from '../src/account-store.js'
import type { EnterpriseLocalApi, EnterpriseLocalStatus } from '../src/local-api.js'
import { EnterpriseLocalApiError } from '../src/local-api.js'

const base = {
  bundleVersion: '0.1.0',
  platformUrl: 'https://enterprise.example.com',
  transport: 'webServer.register' as const,
}

describe('EnterpriseAccountStore', () => {
  it('only polls during login, stops at the deadline, and ignores superseded or unmounted requests', async () => {
    vi.useFakeTimers()
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => ({ ...base, state: 'AUTHORIZING' as const })), refresh: vi.fn(),
      setServerUrl: vi.fn(), bootstrap: vi.fn(), plugins: vi.fn(), installPlugin: vi.fn(), removePlugin: vi.fn(),
      sessionSync: vi.fn(), sessions: vi.fn(), restoreSession: vi.fn(), deleteSession: vi.fn(),
      startLogin: vi.fn(), cancelLogin: vi.fn(), logout: vi.fn(), uninstall: vi.fn(),
    }
    const store = new EnterpriseAccountStore(api)
    const unsubscribe = store.subscribe(() => {})
    try {
      await vi.advanceTimersByTimeAsync(331_000)
      const calls = vi.mocked(api.status).mock.calls.length
      expect(calls).toBeGreaterThan(1)
      await vi.advanceTimersByTimeAsync(600_000)
      expect(api.status).toHaveBeenCalledTimes(calls)
      let resolveOld!: (value: EnterpriseLocalStatus) => void
      vi.mocked(api.status).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      const stale = store.refresh()
      vi.mocked(api.status).mockResolvedValue({ ...base, state: 'SIGNED_OUT' })
      await store.refresh()
      resolveOld({ ...base, state: 'AUTHORIZING' })
      await stale
      expect(store.getSnapshot().status?.state).toBe('SIGNED_OUT')
      const settledCalls = vi.mocked(api.status).mock.calls.length
      await vi.advanceTimersByTimeAsync(600_000)
      expect(api.status).toHaveBeenCalledTimes(settledCalls)
      vi.mocked(api.status).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      const pending = store.refresh()
      unsubscribe()
      expect(vi.mocked(api.status).mock.calls.at(-1)?.[0]?.aborted).toBe(true)
      resolveOld({ ...base, state: 'AUTHORIZING' })
      await pending
      expect(store.getSnapshot().status?.state).toBe('SIGNED_OUT')
      expect(vi.getTimerCount()).toBe(0)
    } finally { unsubscribe(); vi.useRealTimers() }
  })

  it('reads state on demand, serializes actions, and loads READY account facts', async () => {
    let current: EnterpriseLocalStatus = { ...base, state: 'SIGNED_OUT' }
    const publish = async (status: EnterpriseLocalStatus) => { current = status; await store.refresh() }
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => current),
      refresh: vi.fn(async () => current),
      setServerUrl: vi.fn(async serverUrl => ({ serverUrl })),
      bootstrap: vi.fn(async () => ({
        user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
        device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
      })),
      plugins: vi.fn(async () => ({
        assignmentRevision: 7,
        plugins: [{
          packageName: '@example/dsh-code-review',
          version: '1.2.0',
          desiredRevision: 7,
          desiredState: 'INSTALLED',
          state: 'RESTART_REQUIRED',
          lastErrorCode: null,
        }],
      })),
      installPlugin: vi.fn(async () => ({ assignmentRevision: 7, plugins: [] })),
      removePlugin: vi.fn(async () => ({ assignmentRevision: 7, plugins: [] })),
      sessionSync: vi.fn(async () => ({ backlog: 0, lastSuccessfulSyncAt: null, cursors: [] })),
      sessions: vi.fn(async () => ({
        items: [{
          id: 'remote-1', title: 'Remote Session', sourceDeviceId: '90018', sourceDeviceName: 'Zhang Mac',
          formatVersion: 0, lastSeq: 2, eventCount: 3, status: 'ACTIVE',
          createdAt: '2026-08-19T04:00:00.000Z', updatedAt: '2026-08-19T05:00:00.000Z',
        }],
        page: { hasMore: false, limit: 50, nextCursor: null },
      })),
      restoreSession: vi.fn(async sourceSessionId => ({
        sessionId: 'restored-1', sourceSessionId, seedLength: 3, durable: true,
      })),
      deleteSession: vi.fn(async sessionId => ({
        replicaId: '701', sessionId, status: 'DELETED', deletedAt: '2026-08-19T06:00:00.000Z',
      })),
      startLogin: vi.fn(async () => { current = { ...base, state: 'AUTHORIZING', flowId: 'flow-1' }; return { flowId: 'flow-1' } }),
      cancelLogin: vi.fn(async () => { current = { ...base, state: 'CANCELLED', errorCode: 'ENT_AUTH_CANCELLED' }; return { cancelled: true } }),
      logout: vi.fn(async () => { current = { ...base, state: 'SIGNED_OUT' }; return { loggedOut: true } }),
      uninstall: vi.fn(async () => ({ uninstalled: true, restartRequested: false })),
    }
    const store = new EnterpriseAccountStore(api)
    const changed = vi.fn()
    const unsubscribe = store.subscribe(changed)
    await vi.waitFor(() => { expect(store.getSnapshot().status?.state).toBe('SIGNED_OUT') })

    await store.startLogin()
    expect(store.getSnapshot().status?.state).toBe('AUTHORIZING')
    await store.cancelLogin()
    expect(store.getSnapshot()).toMatchObject({ status: { state: 'CANCELLED' }, errorCode: 'ENT_AUTH_CANCELLED' })

    await publish({
      ...base,
      state: 'READY',
      revision: 7,
      connectedAt: '2026-08-18T00:00:00.000Z',
      user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
    })
    await vi.waitFor(() => { expect(store.getSnapshot().bootstrap?.device.id).toBe('90018') })
    await vi.waitFor(() => { expect(store.getSnapshot().pluginStatus?.assignmentRevision).toBe(7) })
    await publish({ ...current, state: 'REFRESHING', revision: 7 })
    await publish({ ...current, state: 'READY', revision: 7 })
    expect(api.bootstrap).toHaveBeenCalledOnce()
    expect(api.plugins).toHaveBeenCalledOnce()
    await publish({ ...current, state: 'READY', revision: 8 })
    await vi.waitFor(() => { expect(api.bootstrap).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(api.plugins).toHaveBeenCalledTimes(2) })
    expect(api.sessionSync).not.toHaveBeenCalled()
    expect(api.sessions).not.toHaveBeenCalled()
    expect(api.restoreSession).not.toHaveBeenCalled()
    expect(api.deleteSession).not.toHaveBeenCalled()
    await store.refreshPlugins()
    expect(api.plugins).toHaveBeenCalledTimes(3)
    expect(api.installPlugin).not.toHaveBeenCalled()
    expect(api.removePlugin).not.toHaveBeenCalled()
    await store.installPlugin('@example/dsh-code-review', '880')
    expect(api.installPlugin).toHaveBeenCalledWith('@example/dsh-code-review', '880', expect.any(AbortSignal))
    await store.removePlugin('@example/dsh-code-review')
    expect(api.removePlugin).toHaveBeenCalledOnce()
    await store.logout()
    expect(store.getSnapshot().status?.state).toBe('SIGNED_OUT')
    expect(store.getSnapshot().bootstrap).toBeUndefined()
    expect(store.getSnapshot().pluginStatus).toBeUndefined()
    await store.uninstall()
    expect(store.getSnapshot().uninstallRestartRequested).toBe(false)
    expect(api.uninstall).toHaveBeenCalledOnce()

    unsubscribe()
    expect(api.refresh).toHaveBeenCalledOnce()
  })

  it('maps local failures to a stable code without service messages', async () => {
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => { throw new EnterpriseLocalApiError('ENT_PLATFORM_UNAVAILABLE', 503) }),
      refresh: vi.fn(),
      setServerUrl: vi.fn(),
      bootstrap: vi.fn(),
      plugins: vi.fn(),
      installPlugin: vi.fn(),
      removePlugin: vi.fn(),
      sessionSync: vi.fn(),
      sessions: vi.fn(),
      restoreSession: vi.fn(),
      deleteSession: vi.fn(),
      startLogin: vi.fn(),
      cancelLogin: vi.fn(),
      logout: vi.fn(),
      uninstall: vi.fn(),
    }
    const store = new EnterpriseAccountStore(api)
    const unsubscribe = store.subscribe(() => undefined)
    await vi.waitFor(() => {
      expect(store.getSnapshot()).toEqual({ phase: 'error', errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    })
    unsubscribe()
  })
})
