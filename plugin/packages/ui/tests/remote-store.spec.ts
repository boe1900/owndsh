/**
 * [INPUT]: 依赖远控状态控制器、可控异步 API 与 Vitest 时钟
 * [OUTPUT]: 验证整页切换、卸载取消、断线锁定、打开和重连占用提示，以及返回本机不等待网络
 * [POS]: dsh-ui 远控生命周期行为回归，不依赖 Host 或真实用户账号
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteLocalApiError, type RemoteDevice, type RemoteLocalApi } from '../src/remote-api.js'
import { RemoteDeviceStore, RemoteWorkspaceStore } from '../src/remote-store.js'
const view = {
  viewId: 'abcdefghijklmnop', deviceId: '11', name: '办公室 Mac', authority: 'tenant/user/device-b/v1', localUrl: '/',
  stateUrl: '/enterprise/api/v1/local/remote/views/abcdefghijklmnop/state',
  reconnectUrl: '/enterprise/api/v1/local/remote/views/abcdefghijklmnop/reconnect',
} as const
const device: RemoteDevice = {
  deviceId: '11', installationId: '22222222-2222-4222-8222-222222222222',
  name: '办公室 Mac', platform: 'darwin', status: 'ACTIVE', online: true, remoteEnabled: true,
  capabilities: ['remote.connect'], capabilityRevision: 1, revision: 1, lastPresenceAt: null,
}

function api() {
  return {
    status: vi.fn<RemoteLocalApi['status']>().mockResolvedValue(false),
    devices: vi.fn<RemoteLocalApi['devices']>().mockResolvedValue([{ ...device, capabilities: ['remote.connect'] }]),
    setEnabled: vi.fn<RemoteLocalApi['setEnabled']>().mockResolvedValue(true),
    open: vi.fn<RemoteLocalApi['open']>().mockResolvedValue('/enterprise/remote/views/abcdefghijklmnop/'),
    state: vi.fn<RemoteLocalApi['state']>().mockResolvedValue('connected'),
    reconnect: vi.fn<RemoteLocalApi['reconnect']>().mockResolvedValue('/enterprise/remote/views/abcdefghijklmnop/'),
    close: vi.fn<RemoteLocalApi['close']>().mockResolvedValue(undefined),
  }
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
afterEach(() => { vi.useRealTimers() })

describe('device selection lifecycle', () => {
  it('keeps selection open with the busy reason and permits explicit retry', async () => {
    const remote = api(), navigate = vi.fn()
    remote.open.mockRejectedValueOnce(new RemoteLocalApiError('busy'))
    const store = new RemoteDeviceStore(remote, navigate)
    const stop = store.subscribe(vi.fn())
    try {
      await flush()
      await store.open(device)
      expect(store.getSnapshot()).toMatchObject({ kind: 'ready', action: { kind: 'idle' }, message: '该设备正在被其他页面使用，请先关闭原连接后重试。' })
      expect(navigate).not.toHaveBeenCalled()
      await store.open(device)
      expect(navigate).toHaveBeenCalledOnce()
    } finally { stop() }
  })
  it('never polls or connects without an explicit action and accepts outbound use while inbound is off', async () => {
    vi.useFakeTimers()
    const remote = api(), navigate = vi.fn()
    const store = new RemoteDeviceStore(remote, navigate)
    const stop = store.subscribe(vi.fn())
    await flush()
    expect(store.getSnapshot()).toMatchObject({ kind: 'ready', enabled: false })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(remote.status).toHaveBeenCalledTimes(1)
    expect(remote.open).not.toHaveBeenCalled()
    const target: RemoteDevice = { ...device, capabilities: ['remote.connect'] }
    await store.open({ ...target, online: false })
    expect(remote.open).not.toHaveBeenCalled()
    await store.open(target)
    expect(navigate).toHaveBeenCalledWith('/enterprise/remote/views/abcdefghijklmnop/')
    stop()
  })
  it('cancels pending selection on unmount and ignores late success', async () => {
    const remote = api(), navigate = vi.fn()
    let complete: (url: string) => void = () => undefined
    remote.open.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const store = new RemoteDeviceStore(remote, navigate)
    const stop = store.subscribe(vi.fn())
    await flush()
    const opening = store.open({ ...device, capabilities: ['remote.connect'] })
    const requestSignal = remote.open.mock.calls[0]?.[1]
    stop()
    expect(requestSignal?.aborted).toBe(true)
    complete('/enterprise/remote/views/abcdefghijklmnop/')
    await opening
    expect(navigate).not.toHaveBeenCalled()
  })
  it('allows explicit retry after discovery or opening failure', async () => {
    const remote = api(), navigate = vi.fn()
    remote.devices.mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce([{ ...device, capabilities: ['remote.connect'] }])
    remote.open.mockRejectedValueOnce(new Error('private'))
    const store = new RemoteDeviceStore(remote, navigate)
    const stop = store.subscribe(vi.fn())
    await flush()
    expect(store.getSnapshot()).toMatchObject({ kind: 'error' })
    await store.refresh()
    await store.open({ ...device, capabilities: ['remote.connect'] })
    expect(store.getSnapshot()).toMatchObject({ kind: 'ready', action: { kind: 'idle' } })
    expect(navigate).not.toHaveBeenCalled()
    await store.open({ ...device, capabilities: ['remote.connect'] })
    expect(navigate).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('fixed remote workspace lifecycle', () => {
  it('keeps the target locked with the busy reason after reconnect rejection', async () => {
    const remote = api(), navigate = vi.fn()
    remote.state.mockResolvedValue('disconnected')
    remote.reconnect.mockRejectedValueOnce(new RemoteLocalApiError('busy'))
    const store = new RemoteWorkspaceStore(remote, view, navigate)
    const stop = store.subscribe(vi.fn())
    try {
      await flush()
      await store.reconnect()
      expect(store.getSnapshot()).toMatchObject({ kind: 'disconnected', message: '该设备正在被其他页面使用，请先关闭原连接后重试。' })
      expect(navigate).not.toHaveBeenCalled()
      expect(remote.open).not.toHaveBeenCalled()
      await store.reconnect()
      expect(navigate).toHaveBeenCalledOnce()
    } finally { stop() }
  })
  it('keeps a disconnected page alive and locked until explicit reconnect navigates', async () => {
    vi.useFakeTimers()
    const remote = api(), navigate = vi.fn()
    remote.state.mockResolvedValueOnce('connected').mockResolvedValueOnce('disconnected').mockResolvedValue('connected')
    const store = new RemoteWorkspaceStore(remote, view, navigate)
    expect(store.getSnapshot().kind).toBe('checking')
    const stop = store.subscribe(vi.fn())
    await flush()
    expect(store.getSnapshot().kind).toBe('connected')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(store.getSnapshot().kind).toBe('disconnected')
    await store.check()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(remote.state.mock.calls.length).toBeGreaterThan(10)
    expect(store.getSnapshot().kind).toBe('disconnected')
    expect(navigate).not.toHaveBeenCalled()
    await store.reconnect()
    expect(navigate).toHaveBeenCalledWith('/enterprise/remote/views/abcdefghijklmnop/')
    expect(store.getSnapshot().kind).toBe('reconnecting')
    expect(remote.open).not.toHaveBeenCalled()
    stop()
  })
  it('blocks status failure, does not replay mutations and permits retry after failed reconnect', async () => {
    const remote = api(), navigate = vi.fn()
    remote.state.mockRejectedValue(new Error('secret'))
    remote.reconnect.mockRejectedValueOnce(new Error('secret'))
    const store = new RemoteWorkspaceStore(remote, view, navigate)
    const stop = store.subscribe(vi.fn())
    await flush()
    expect(store.getSnapshot()).toMatchObject({ kind: 'disconnected' })
    await store.reconnect()
    expect(store.getSnapshot()).toMatchObject({ kind: 'disconnected' })
    expect(navigate).not.toHaveBeenCalled()
    await store.reconnect()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(remote.open).not.toHaveBeenCalled()
    stop()
  })
  it('returns to local immediately even when close never completes', () => {
    const remote = api(), navigate = vi.fn()
    remote.close.mockImplementation(() => new Promise(() => undefined))
    const store = new RemoteWorkspaceStore(remote, view, navigate)
    store.returnLocal()
    expect(remote.close).toHaveBeenCalledWith(view, expect.any(AbortSignal))
    expect(navigate).toHaveBeenCalledWith('/')
  })
  it('aborts status checks and discards their late response after the final subscriber leaves', async () => {
    const remote = api()
    let complete: (value: 'connected') => void = () => undefined
    remote.state.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const store = new RemoteWorkspaceStore(remote, view, vi.fn())
    const stop = store.subscribe(vi.fn())
    stop()
    expect(remote.state.mock.calls[0]?.[1].aborted).toBe(true)
    complete('connected')
    await flush()
    expect(store.getSnapshot().kind).toBe('checking')
  })
  it('preserves the disconnected lock when native slots remount', async () => {
    const remote = api()
    remote.state.mockResolvedValueOnce('disconnected').mockResolvedValue('connected')
    const store = new RemoteWorkspaceStore(remote, view, vi.fn())
    const stop = store.subscribe(vi.fn())
    await flush()
    stop()
    const stopAgain = store.subscribe(vi.fn())
    await flush()
    expect(store.getSnapshot().kind).toBe('disconnected')
    expect(remote.state).toHaveBeenCalledTimes(2)
    stopAgain()
  })
})
