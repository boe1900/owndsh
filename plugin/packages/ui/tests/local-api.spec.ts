/**
 * [INPUT]: 依赖 dsh-ui 同源 local-api、标准 Response 与 EventSource test double
 * [OUTPUT]: 验证账号/插件严格解码、地址/卸载固定路径、脱敏投影、显式刷新与秘密字段拒绝
 * [POS]: dsh-ui 浏览器网络边界测试，确保浏览器只能消费 Host 脱敏 DTO
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createEnterpriseLocalApi,
  decodeEnterprisePluginStatus,
  decodeEnterpriseLocalStatus,
  ENTERPRISE_CONNECTION_STATES,
  MANAGED_PLUGIN_STATES,
} from '../src/local-api.js'

const STATUS = {
  state: 'SIGNED_OUT' as const,
  bundleVersion: '0.1.0',
  platformUrl: 'https://enterprise.example.com',
  transport: 'webServer.register' as const,
}

const PLUGIN = {
  packageName: '@example/dsh-code-review',
  version: '1.2.0',
  sha256: 'a'.repeat(64),
  desiredRevision: 7,
  desiredState: 'INSTALLED' as const,
  state: 'RESTART_REQUIRED' as const,
  lastErrorCode: null,
  restartMarker: 'run-20260819',
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

describe('enterprise local browser API', () => {
  it('strictly decodes every public connection state', () => {
    for (const state of ENTERPRISE_CONNECTION_STATES) {
      const value = state === 'UNCONFIGURED'
        ? { ...STATUS, state, platformUrl: null }
        : { ...STATUS, state }
      expect(decodeEnterpriseLocalStatus(value)).toEqual(value)
    }
    expect(() => decodeEnterpriseLocalStatus({ ...STATUS, accessToken: 'must-not-cross' }))
      .toThrow('ENT_LOCAL_RESPONSE_INVALID')
    expect(() => decodeEnterpriseLocalStatus({ ...STATUS, platformUrl: 'https://user:secret@example.com' }))
      .toThrow('ENT_LOCAL_RESPONSE_INVALID')
  })

  it('projects account bootstrap and never returns unrelated policy fields', async () => {
    const fetcher = vi.fn(async () => ok({
      revision: 7,
      user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
      device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
      models: [{ alias: 'not-exposed-by-t07' }],
      quotas: [],
      plugins: { revision: 1, assignments: [] },
      sessionPolicy: { enabled: true },
    }))
    const api = createEnterpriseLocalApi(fetcher)
    await expect(api.bootstrap(new AbortController().signal)).resolves.toEqual({
      user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
      device: { id: '90018', installationId: '4c96d076-a80a-4b6c-8df6-f0db804b6f0a', status: 'ACTIVE' },
    })
  })

  it('strictly validates plugin records and drops SHA and restart markers from the browser projection', async () => {
    for (const state of MANAGED_PLUGIN_STATES) {
      expect(decodeEnterprisePluginStatus({ assignmentRevision: 7, plugins: [{ ...PLUGIN, state }] }))
        .toEqual({
          assignmentRevision: 7,
          plugins: [{
            packageName: PLUGIN.packageName,
            version: PLUGIN.version,
            desiredRevision: 7,
            desiredState: 'INSTALLED',
            state,
            lastErrorCode: null,
          }],
        })
    }
    expect(() => decodeEnterprisePluginStatus({
      assignmentRevision: 7,
      plugins: [{ ...PLUGIN, tgzPath: '/private/plugin.tgz' }],
    })).toThrow('ENT_LOCAL_RESPONSE_INVALID')
    expect(() => decodeEnterprisePluginStatus({
      assignmentRevision: 7,
      plugins: [{ ...PLUGIN, accessToken: 'must-not-cross' }],
    })).toThrow('ENT_LOCAL_RESPONSE_INVALID')

    const fetcher = vi.fn(async () => ok({
      assignmentRevision: 7,
      plugins: [PLUGIN],
      lastReportErrorCode: 'ENT_PLATFORM_UNAVAILABLE',
    }))
    const projected = await createEnterpriseLocalApi(fetcher).plugins(new AbortController().signal)
    expect(projected).toMatchObject({ assignmentRevision: 7, lastReportErrorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    expect(JSON.stringify(projected)).not.toMatch(/sha256|restartMarker|tgz|token|publicKey|cli/i)
    expect(fetcher).toHaveBeenCalledWith(
      '/enterprise/api/v1/local/plugins',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps catalog metadata separate from installation facts and sends explicit version-bound commands', async () => {
    const item = { pluginVersionId: '880', packageName: '@example/tools', version: '1.0.0', sizeBytes: 100, operatingSystems: ['darwin'] }
    const status = { assignmentRevision: 7, catalog: [item], plugins: [] }
    expect(decodeEnterprisePluginStatus(status)).toEqual(status)
    for (const catalog of [[{ ...item, accessToken: 'secret' }], [{ ...item, downloadUrl: 'https://invalid' }], [item, item], [{ ...item, sizeBytes: -1 }]]) {
      expect(() => decodeEnterprisePluginStatus({ ...status, catalog })).toThrow('ENT_LOCAL_RESPONSE_INVALID')
    }
    const fetcher = vi.fn(async () => ok(status))
    const api = createEnterpriseLocalApi(fetcher)
    const signal = new AbortController().signal
    await api.installPlugin(item.packageName, item.pluginVersionId, signal)
    expect(fetcher).toHaveBeenLastCalledWith('/enterprise/api/v1/local/plugins/install', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ packageName: item.packageName, pluginVersionId: '880' }), signal,
    }))
    await api.removePlugin(item.packageName, signal)
    expect(fetcher).toHaveBeenLastCalledWith('/enterprise/api/v1/local/plugins/remove', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ packageName: item.packageName }), signal,
    }))
  })

  it('uses same-origin fixed paths and strict empty-object POST actions', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith('/status')) return ok(STATUS)
      if (path.endsWith('/auth/start')) return ok({ flowId: 'flow-1' })
      if (path.endsWith('/auth/cancel')) return ok({ cancelled: true })
      if (path.endsWith('/logout')) return ok({ loggedOut: true })
      if (path.endsWith('/server')) return ok({ serverUrl: 'https://next.example.com' })
      if (path.endsWith('/uninstall')) return ok({ uninstalled: true, restartRequested: false })
      throw new Error(`unexpected path ${path}`)
    })
    const api = createEnterpriseLocalApi(fetcher)
    const signal = new AbortController().signal
    await expect(api.status(signal)).resolves.toEqual(STATUS)
    await expect(api.startLogin(signal)).resolves.toEqual({ flowId: 'flow-1' })
    await expect(api.cancelLogin(signal)).resolves.toEqual({ cancelled: true })
    await expect(api.logout(signal)).resolves.toEqual({ loggedOut: true })
    await expect(api.setServerUrl('https://next.example.com', signal)).resolves.toEqual({
      serverUrl: 'https://next.example.com',
    })
    await expect(api.uninstall(signal)).resolves.toEqual({ uninstalled: true, restartRequested: false })

    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      '/enterprise/api/v1/local/status',
      '/enterprise/api/v1/local/auth/start',
      '/enterprise/api/v1/local/auth/cancel',
      '/enterprise/api/v1/local/logout',
      '/enterprise/api/v1/local/server',
      '/enterprise/api/v1/local/uninstall',
    ])
    for (const call of [1, 2, 3, 5].map(index => fetcher.mock.calls[index])) {
      expect(call[1]).toMatchObject({ body: '{}', method: 'POST' })
      expect(new Headers(call[1]?.headers).get('authorization')).toBeNull()
    }
    expect(fetcher.mock.calls[4]?.[1]).toMatchObject({
      body: '{"serverUrl":"https://next.example.com"}', method: 'POST',
    })
  })

  it('refreshes account state with one JSON request', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: STATUS }), {
      headers: { 'content-type': 'application/json' },
    }))
    const api = createEnterpriseLocalApi(fetcher)
    await expect(api.refresh(new AbortController().signal)).resolves.toEqual(STATUS)
    expect(fetcher).toHaveBeenCalledWith('/enterprise/api/v1/local/refresh', expect.objectContaining({
      method: 'POST', body: '{}',
    }))
    expect('events' in api).toBe(false)
  })

})
