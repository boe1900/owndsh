/**
 * [INPUT]: 依赖 EnterpriseAccountStore、local-api 端口和可控请求与时钟
 * [OUTPUT]: 验证手动刷新忙碌/成功/失败与并发阻止、地址保存成败、退出失败后的状态收敛、跨服务/账号迟到响应隔离、MCP 授权与订阅/查询生命周期
 * [POS]: dsh-ui 账号状态控制器测试，覆盖设置与门禁 slot 共享的行为真源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import { EnterpriseAccountStore } from '../src/account-store.js'
import type { EnterpriseAccountBootstrap, EnterpriseLocalApi, EnterpriseLocalStatus, EnterprisePluginStatus } from '../src/local-api.js'
import { EnterpriseLocalApiError } from '../src/local-api.js'

const base = {
  bundleVersion: '0.1.0',
  platformUrl: 'https://enterprise.example.com',
  transport: 'webServer.register' as const,
}

const enterpriseCatalog = [{
  pluginVersionId: '880',
  packageName: '@example/dsh-code-review',
  version: '1.2.0',
  installation: {
    spec: '@example/dsh-code-review@1.2.0',
    displayName: 'Code Review',
    description: 'Review code changes',
    author: 'OwnDsh',
    repositoryUrl: 'https://github.com/example/dsh-code-review',
    categories: ['productivity'],
  },
}] as const

describe('EnterpriseAccountStore', () => {
  it('serializes manual refresh and distinguishes success, request failure, and Host error status', async () => {
    const ready: EnterpriseLocalStatus = { ...base, state: 'READY' }
    let finish!: (status: EnterpriseLocalStatus) => void
    const api = {
      status: vi.fn(async () => ready), bootstrap: vi.fn(), plugins: vi.fn(), mcpStatus: vi.fn(),
      refresh: vi.fn(() => new Promise<EnterpriseLocalStatus>(resolve => { finish = resolve })),
    }
    const store = new EnterpriseAccountStore(api as unknown as EnterpriseLocalApi)
    await store.refresh()
    const pending = store.refreshConfiguration()
    expect(store.getSnapshot().busy).toBe('refresh')
    await expect(store.refreshConfiguration()).resolves.toBe(false)
    expect(api.refresh).toHaveBeenCalledOnce()
    finish(ready)
    await expect(pending).resolves.toBe(true)
    expect(store.getSnapshot().busy).toBeUndefined()
    api.refresh.mockRejectedValueOnce(new EnterpriseLocalApiError('ENT_PLATFORM_UNAVAILABLE', 503))
    await expect(store.refreshConfiguration()).resolves.toBe(false)
    expect(store.getSnapshot()).toMatchObject({ errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    expect(store.getSnapshot().busy).toBeUndefined()
    api.refresh.mockResolvedValueOnce({ ...ready, errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    await expect(store.refreshConfiguration()).resolves.toBe(false)
    api.refresh.mockResolvedValueOnce(ready)
    await expect(store.refreshConfiguration()).resolves.toBe(true)
    expect(store.getSnapshot().errorCode).toBeUndefined()
  })

  it.each(['SUCCEEDED', 'FAILED', 'CANCELLED', 'cancel', 'timeout', 'account-change', 'unmount'] as const)(
    'bounds MCP OAuth polling and settles %s without blocking the enterprise account', async outcome => {
      vi.useFakeTimers()
      let status: EnterpriseLocalStatus = { ...base, state: 'READY' }
      let progress = 'PENDING'
      const mcpStatus = { assignments: [{ serverName: 'docs', displayName: 'Docs', authType: 'oauth', presentation: 'search', configured: false, connected: false, errorCode: 'MCP_AUTH_REQUIRED' }] }
      const api = {
        status: vi.fn(async () => status), bootstrap: vi.fn(), plugins: vi.fn(),
        mcpStatus: vi.fn(async () => mcpStatus),
        startMcpOAuth: vi.fn(async () => ({ flowId: 'flow-1' })),
        mcpOAuthStatus: vi.fn(async () => ({ flowId: 'flow-1', serverName: 'docs', status: progress })),
        cancelMcpOAuth: vi.fn(async () => ({ cancelled: true })),
      }
      const store = new EnterpriseAccountStore(api as unknown as EnterpriseLocalApi)
      const unsubscribe = store.subscribe(() => {})
      try {
        await vi.advanceTimersByTimeAsync(0)
        await store.startMcpOAuth('docs')
        await store.startMcpOAuth('docs')
        expect(api.startMcpOAuth).toHaveBeenCalledOnce()
        expect(store.getSnapshot().mcpOAuth).toEqual({ serverName: 'docs', flowId: 'flow-1' })
        if (outcome === 'cancel') await store.cancelMcpOAuth('flow-1')
        else if (outcome === 'account-change') {
          status = { ...status, platformUrl: 'https://new.example' }
          await store.refresh()
        } else if (outcome === 'unmount') unsubscribe()
        else if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(331_000)
        else {
          progress = outcome
          if (outcome === 'SUCCEEDED') api.mcpStatus.mockResolvedValue({ assignments: [{ ...mcpStatus.assignments[0]!, configured: true, connected: true, errorCode: undefined }] } as any)
          await vi.advanceTimersByTimeAsync(1_000)
        }
        expect(store.getSnapshot().mcpOAuth).toBeUndefined()
        expect(store.getSnapshot().status?.state).toBe('READY')
        expect(store.getSnapshot().mcpErrorCode).toBe(outcome === 'FAILED' ? 'MCP_OAUTH_FAILED' : outcome === 'timeout' ? 'MCP_OAUTH_TIMEOUT' : undefined)
        if (outcome === 'SUCCEEDED') expect(store.getSnapshot().mcpStatus?.assignments[0]?.connected).toBe(true)
        if (outcome === 'cancel') expect(api.cancelMcpOAuth).toHaveBeenCalledWith('flow-1', expect.any(AbortSignal))
        const count = api.mcpOAuthStatus.mock.calls.length
        await vi.advanceTimersByTimeAsync(600_000)
        expect(api.mcpOAuthStatus).toHaveBeenCalledTimes(count)
      } finally { unsubscribe(); vi.useRealTimers() }
    },
  )

  it.each(['start', 'poll', 'status'] as const)('ignores late MCP %s results after an account switch', async pending => {
    let status: EnterpriseLocalStatus = { ...base, state: 'READY' }
    let resolve!: (value: any) => void
    let oldSignal!: AbortSignal
    const delayed = (signal: AbortSignal) => { oldSignal = signal; return new Promise<any>(done => { resolve = done }) }
    const api = {
      status: vi.fn(async () => status), bootstrap: vi.fn(), plugins: vi.fn(),
      mcpStatus: vi.fn(async () => ({ assignments: [] })),
      startMcpOAuth: vi.fn(async (_name: string, signal: AbortSignal) => pending === 'start' ? delayed(signal) : { flowId: 'old-flow' }),
      mcpOAuthStatus: vi.fn(async (_id: string, signal: AbortSignal) => delayed(signal)),
    }
    const store = new EnterpriseAccountStore(api as unknown as EnterpriseLocalApi)
    await store.refresh()
    if (pending === 'status') api.mcpStatus.mockImplementationOnce(delayed as any)
    const action = pending === 'status' ? store.refreshMcp() : store.startMcpOAuth('docs')
    await vi.waitFor(() => expect(resolve).toBeDefined())
    status = { ...status, platformUrl: 'https://new.example' }
    await store.refresh()
    expect(oldSignal.aborted).toBe(true)
    resolve(pending === 'status' ? { assignments: [{ serverName: 'old-server' }] } : { flowId: 'old-flow', serverName: 'docs', status: 'SUCCEEDED' })
    await action
    expect(store.getSnapshot().mcpOAuth).toBeUndefined()
    expect(store.getSnapshot().mcpStatus).toEqual({ assignments: [] })
    expect(store.getSnapshot().mcpErrorCode).toBeUndefined()
    expect(api.mcpStatus).toHaveBeenCalledTimes(pending === 'status' ? 3 : 2)
  })

  it('reports failed and busy saves as unsuccessful, and refreshes local state after a failed logout', async () => {
    let status: EnterpriseLocalStatus = { ...base, state: 'READY' }
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => status), refresh: vi.fn(), bootstrap: vi.fn(), plugins: vi.fn(),
      setServerUrl: vi.fn(async () => { throw new EnterpriseLocalApiError('ENT_INVALID_REQUEST', 400) }),
      logout: vi.fn(async () => { status = { ...base, state: 'SIGNED_OUT' }; throw new EnterpriseLocalApiError('ENT_PLATFORM_UNAVAILABLE', 503) }),
      startLogin: vi.fn(), cancelLogin: vi.fn(), uninstall: vi.fn(),
    }
    const store = new EnterpriseAccountStore(api)
    await store.refresh()
    await store.logout()
    expect(store.getSnapshot()).toMatchObject({ status: { state: 'SIGNED_OUT' }, errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    await expect(store.setServerUrl('https://example.com/path')).resolves.toBe(false)
    expect(store.getSnapshot().errorCode).toBe('ENT_INVALID_REQUEST')
    let finish!: (value: { serverUrl: string }) => void
    vi.mocked(api.setServerUrl).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const saving = store.setServerUrl('https://new.example')
    await expect(store.setServerUrl('https://other.example')).resolves.toBe(false)
    finish({ serverUrl: 'https://new.example' })
    await expect(saving).resolves.toBe(true)
    expect(store.getSnapshot().errorCode).toBeUndefined()
    expect(api.setServerUrl).toHaveBeenCalledTimes(2)
  })

  it.each(['server', 'account', 'sign-out', 'old failure'])(
    'discards old account and plugin responses after %s, even when revisions match', async change => {
      const old: EnterpriseAccountBootstrap = {
        user: { id: '10031', username: 'old', displayName: 'Old', departmentId: null },
        device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
      }
      const next = { ...old, user: { ...old.user, id: '10032', username: 'new' } }
      const nextPlugins = { assignmentRevision: 8, catalog: [] }
      let status: EnterpriseLocalStatus = { ...base, state: 'READY', revision: 7, user: old.user }
      let resolveOld!: (value: EnterpriseAccountBootstrap) => void
      let rejectOld!: (error: Error) => void
      let resolvePlugins!: (value: EnterprisePluginStatus) => void
      let oldSignal!: AbortSignal
      const api: EnterpriseLocalApi = {
        status: vi.fn(async () => status), refresh: vi.fn(),
        bootstrap: vi.fn().mockImplementationOnce((signal: AbortSignal) => {
          oldSignal = signal
          return new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject })
        }).mockResolvedValue(next),
        plugins: vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolvePlugins = resolve })).mockResolvedValue(nextPlugins),
        setServerUrl: vi.fn(), startLogin: vi.fn(), cancelLogin: vi.fn(), logout: vi.fn(), uninstall: vi.fn(),
      }
      const store = new EnterpriseAccountStore(api)
      await store.refresh()
      if (change === 'sign-out') { status = { ...status, state: 'SIGNED_OUT' }; await store.refresh() }
      status = { ...status, state: 'READY', ...(change === 'account' ? { user: next.user } : { platformUrl: 'https://new.example' }) }
      await store.refresh()
      await vi.waitFor(() => expect(store.getSnapshot().bootstrap).toEqual(next))
      expect(oldSignal.aborted).toBe(true)
      if (change === 'old failure') rejectOld(new EnterpriseLocalApiError('ENT_PLATFORM_UNAVAILABLE', 503))
      else resolveOld(old)
      resolvePlugins({ assignmentRevision: 1, catalog: [] })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(store.getSnapshot().bootstrap).toEqual(next)
      expect(store.getSnapshot().pluginStatus).toEqual(nextPlugins)
      expect(store.getSnapshot().errorCode).toBeUndefined()
      expect(api.bootstrap).toHaveBeenCalledTimes(2)
      expect(api.plugins).toHaveBeenCalledTimes(2)
    },
  )

  it('only polls during login, stops at the deadline, and ignores superseded or unmounted requests', async () => {
    vi.useFakeTimers()
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => ({ ...base, state: 'AUTHORIZING' as const })), refresh: vi.fn(),
      setServerUrl: vi.fn(), bootstrap: vi.fn(), plugins: vi.fn(),
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
        catalog: enterpriseCatalog,
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
    await store.refreshPlugins()
    expect(api.plugins).toHaveBeenCalledTimes(3)
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
