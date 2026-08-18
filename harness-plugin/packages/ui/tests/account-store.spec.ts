/**
 * [INPUT]: 依赖 EnterpriseAccountStore、local-api 端口和可控 SSE test double
 * [OUTPUT]: 验证订阅生命周期、登录/取消/退出串行、READY bootstrap 与稳定错误投影
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
  it('shares SSE state, serializes actions, loads READY account facts, and disposes', async () => {
    let current: EnterpriseLocalStatus = { ...base, state: 'SIGNED_OUT' }
    let publish: (status: EnterpriseLocalStatus) => void = () => undefined
    const close = vi.fn()
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => current),
      bootstrap: vi.fn(async () => ({
        user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
        device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
      })),
      startLogin: vi.fn(async () => { current = { ...base, state: 'AUTHORIZING', flowId: 'flow-1' }; return { flowId: 'flow-1' } }),
      cancelLogin: vi.fn(async () => { current = { ...base, state: 'CANCELLED', errorCode: 'ENT_AUTH_CANCELLED' }; return { cancelled: true } }),
      logout: vi.fn(async () => { current = { ...base, state: 'SIGNED_OUT' }; return { loggedOut: true } }),
      events: (onStatus) => { publish = onStatus; return { close } },
    }
    const store = new EnterpriseAccountStore(api)
    const changed = vi.fn()
    const unsubscribe = store.subscribe(changed)
    await vi.waitFor(() => { expect(store.getSnapshot().status?.state).toBe('SIGNED_OUT') })

    await store.startLogin()
    expect(store.getSnapshot().status?.state).toBe('AUTHORIZING')
    await store.cancelLogin()
    expect(store.getSnapshot()).toMatchObject({ status: { state: 'CANCELLED' }, errorCode: 'ENT_AUTH_CANCELLED' })

    publish({
      ...base,
      state: 'READY',
      revision: 7,
      connectedAt: '2026-08-18T00:00:00.000Z',
      user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
    })
    await vi.waitFor(() => { expect(store.getSnapshot().bootstrap?.device.id).toBe('90018') })
    await store.logout()
    expect(store.getSnapshot().status?.state).toBe('SIGNED_OUT')
    expect(store.getSnapshot().bootstrap).toBeUndefined()

    unsubscribe()
    expect(close).toHaveBeenCalledOnce()
  })

  it('maps local failures to a stable code without service messages', async () => {
    const api: EnterpriseLocalApi = {
      status: vi.fn(async () => { throw new EnterpriseLocalApiError('ENT_PLATFORM_UNAVAILABLE', 503) }),
      bootstrap: vi.fn(),
      startLogin: vi.fn(),
      cancelLogin: vi.fn(),
      logout: vi.fn(),
      events: () => ({ close: vi.fn() }),
    }
    const store = new EnterpriseAccountStore(api)
    const unsubscribe = store.subscribe(() => undefined)
    await vi.waitFor(() => {
      expect(store.getSnapshot()).toEqual({ phase: 'error', errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    })
    unsubscribe()
  })
})
