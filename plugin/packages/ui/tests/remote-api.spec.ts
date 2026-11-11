/**
 * [INPUT]: 依赖远控 API 边界、生成设备 schema 与结构化 fetch 响应
 * [OUTPUT]: 验证同源控制请求、严格设备/元数据与安全导航拒绝规则
 * [POS]: dsh-ui 远控协议回归，确保任何异常都不能把远端页面降级为本机页面
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import { createRemoteLocalApi, readRemoteView, remoteDeviceUnavailable, RemoteLocalApiError } from '../src/remote-api.js'

const view = {
  viewId: 'abcdefghijklmnop', deviceId: '11', name: '办公室 Mac', authority: 'tenant/user/device-b/v1', localUrl: '/',
  stateUrl: '/enterprise/api/v1/local/remote/views/abcdefghijklmnop/state',
  reconnectUrl: '/enterprise/api/v1/local/remote/views/abcdefghijklmnop/reconnect',
} as const
const device = {
  deviceId: '11', installationId: '22222222-2222-4222-8222-222222222222',
  name: '办公室 Mac', platform: 'darwin', status: 'ACTIVE', online: true, remoteEnabled: true,
  capabilities: ['remote.connect'], capabilityRevision: 1, revision: 1, lastPresenceAt: null,
} as const
const signal = new AbortController().signal
const response = (data: unknown): Response => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } })

describe('remote view boundary', () => {
  it('only treats a root page without metadata as local', () => {
    expect(readRemoteView(undefined, '/')).toEqual({ kind: 'local' })
    expect(readRemoteView(undefined, '/enterprise/remote/views/abcdefghijklmnop/')).toEqual({ kind: 'invalid' })
    expect(readRemoteView(view, '/enterprise/remote/views/abcdefghijklmnop/')).toEqual({ kind: 'remote', view })
    expect(readRemoteView(view, '/')).toEqual({ kind: 'invalid' })
  })
  it.each([
    { ...view, secret: 'not-allowed' }, { ...view, localUrl: '//other.invalid' },
    { ...view, stateUrl: '//other.invalid/state' }, { ...view, reconnectUrl: '/api/reconnect' },
    { ...view, viewId: '../escape' },
  ])('fails closed for invalid metadata', metadata => {
    expect(readRemoteView(metadata, '/enterprise/remote/views/abcdefghijklmnop/')).toEqual({ kind: 'invalid' })
  })
})

describe('remote local API', () => {
  it('sends fixed same-origin requests and only exposes validated device facts', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ enabled: false }))
      .mockResolvedValueOnce(response({ items: [device] })).mockResolvedValueOnce(response({ enabled: true }))
      .mockResolvedValueOnce(response({ url: '/enterprise/remote/views/abcdefghijklmnop/' }))
    const api = createRemoteLocalApi(request)
    expect(await api.status(signal)).toBe(false)
    expect(await api.devices(signal)).toEqual([device])
    expect(await api.setEnabled(true, signal)).toBe(true)
    expect(await api.open(device.deviceId, signal)).toBe('/enterprise/remote/views/abcdefghijklmnop/')
    expect(request.mock.calls.map(call => call[0])).toEqual([
      '/enterprise/api/v1/local/remote/status', '/enterprise/api/v1/local/remote/devices',
      '/enterprise/api/v1/local/remote/enabled', '/enterprise/api/v1/local/remote/views',
    ])
    for (const [, init] of request.mock.calls) expect(init).toMatchObject({ credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal })
    expect(request.mock.calls[2]?.[1]?.body).toBe('{"enabled":true}')
    expect(request.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ deviceId: device.deviceId }))
  })
  it.each(['https://other.invalid/', '//other.invalid/', '/enterprise/remote/views/../', '/enterprise/remote/views/abcdefghijklmnop/?x=1', '/'])('rejects an unsafe view URL %s', async url => {
    const api = createRemoteLocalApi(vi.fn<typeof fetch>().mockResolvedValue(response({ url })))
    await expect(api.open(device.deviceId, signal)).rejects.toBeInstanceOf(RemoteLocalApiError)
  })
  it('accepts a new isolated view after reconnect', async () => {
    const api = createRemoteLocalApi(vi.fn<typeof fetch>().mockResolvedValue(response({ url: '/enterprise/remote/views/qrstuvwxyzABCDEF/' })))
    await expect(api.reconnect(view, signal)).resolves.toBe('/enterprise/remote/views/qrstuvwxyzABCDEF/')
  })
  it('rejects unknown device fields and never exposes server error content', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ items: [{ ...device, token: 'secret' }] }))
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 403 }))
    const api = createRemoteLocalApi(request)
    await expect(api.devices(signal)).rejects.toMatchObject({ kind: 'invalid' })
    await expect(api.status(signal)).rejects.toMatchObject({ kind: 'unauthorized', message: 'unauthorized' })
  })
  it('distinguishes offline, disabled and unsupported devices before opening', () => {
    const ready = { ...device, capabilities: ['remote.connect'] } satisfies Parameters<typeof remoteDeviceUnavailable>[0]
    expect(remoteDeviceUnavailable(ready)).toBeUndefined()
    expect(remoteDeviceUnavailable({ ...ready, online: false })).toBe('离线')
    expect(remoteDeviceUnavailable({ ...ready, remoteEnabled: false })).toBe('未开启远程访问')
    expect(remoteDeviceUnavailable({ ...ready, capabilities: [] })).toBe('不支持远程工作区')
  })
})
