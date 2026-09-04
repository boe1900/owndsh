/**
 * [INPUT]: 依赖 dsh-ui 同源 local-api、标准 Response 与 EventSource test double
 * [OUTPUT]: 验证账号/插件/Session 严格解码、地址/卸载固定路径、恢复/删除、脱敏投影、复合 SSE 与秘密字段拒绝
 * [POS]: dsh-ui 浏览器网络边界测试，确保浏览器只能消费 Host 脱敏 DTO
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createEnterpriseLocalApi,
  decodeEnterprisePluginStatus,
  decodeEnterpriseLocalStatus,
  decodeEnterpriseRemoteSessionPage,
  decodeEnterpriseSessionSyncStatus,
  ENTERPRISE_CONNECTION_STATES,
  MANAGED_PLUGIN_STATES,
  SESSION_SYNC_STATES,
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

const SESSION_SYNC = {
  backlog: 1,
  lastSuccessfulSyncAt: '2026-08-19T05:00:00.000Z',
  cursors: [{
    sessionId: 'session-t18', sourceDeviceId: '90018', lastAckSeq: 4,
    rollingHash: `${'A'.repeat(43)}=`, state: 'RETRY_WAIT' as const,
    lastErrorCode: 'ENT_PLATFORM_UNAVAILABLE', updatedAt: '2026-08-19T05:01:00.000Z',
    lastSuccessAt: '2026-08-19T05:00:00.000Z',
  }],
}

const REMOTE_SESSION = {
  id: 'session-t18', title: 'Remote Session', sourceDeviceId: '90018', sourceDeviceName: 'Zhang Mac',
  formatVersion: 0 as const, lastSeq: 4, eventCount: 5, status: 'ACTIVE' as const,
  createdAt: '2026-08-19T04:00:00.000Z', updatedAt: '2026-08-19T05:00:00.000Z',
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

  it('strictly projects Session sync/list DTOs without hashes, source IDs, or content bytes', () => {
    for (const state of SESSION_SYNC_STATES) {
      expect(decodeEnterpriseSessionSyncStatus({
        ...SESSION_SYNC, cursors: [{ ...SESSION_SYNC.cursors[0], state }],
      }).cursors[0]?.state).toBe(state)
    }
    const sync = decodeEnterpriseSessionSyncStatus(SESSION_SYNC)
    expect(sync.cursors[0]).toEqual({
      sessionId: 'session-t18', lastAckSeq: 4, state: 'RETRY_WAIT',
      lastErrorCode: 'ENT_PLATFORM_UNAVAILABLE', updatedAt: '2026-08-19T05:01:00.000Z',
      lastSuccessAt: '2026-08-19T05:00:00.000Z',
    })
    expect(JSON.stringify(sync)).not.toMatch(/rollingHash|sourceDeviceId|payload|events/i)
    expect(decodeEnterpriseRemoteSessionPage({
      items: [REMOTE_SESSION], page: { hasMore: false, limit: 50, nextCursor: null },
    }).items).toEqual([REMOTE_SESSION])
    expect(() => decodeEnterpriseSessionSyncStatus({ ...SESSION_SYNC, accessToken: 'must-not-cross' }))
      .toThrow('ENT_LOCAL_RESPONSE_INVALID')
    expect(() => decodeEnterpriseRemoteSessionPage({
      items: [{ ...REMOTE_SESSION, payloadBase64: 'must-not-cross' }],
      page: { hasMore: false, limit: 50, nextCursor: null },
    })).toThrow('ENT_LOCAL_RESPONSE_INVALID')
    for (const invalidTime of ['2026-08-19 05:00:00Z', '2026-08-19T05:00:00', '2026-13-19T05:00:00Z']) {
      expect(() => decodeEnterpriseSessionSyncStatus({
        ...SESSION_SYNC, lastSuccessfulSyncAt: invalidTime,
      })).toThrow('ENT_LOCAL_RESPONSE_INVALID')
    }
    expect(() => decodeEnterpriseRemoteSessionPage({
      items: [{ ...REMOTE_SESSION, sourceDeviceName: 'x'.repeat(121) }],
      page: { hasMore: false, limit: 50, nextCursor: null },
    })).toThrow('ENT_LOCAL_RESPONSE_INVALID')
    expect(() => decodeEnterpriseRemoteSessionPage({
      items: [REMOTE_SESSION], page: { hasMore: true, limit: 50, nextCursor: 'x'.repeat(4097) },
    })).toThrow('ENT_LOCAL_RESPONSE_INVALID')
  })

  it('uses fixed same-origin Session paths for list, restore, and delete', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith('/sessions/sync')) return ok(SESSION_SYNC)
      if (path.includes('/sessions?')) return ok({
        items: [REMOTE_SESSION], page: { hasMore: false, limit: 20, nextCursor: null },
      })
      if (path.endsWith('/sessions/session-t18/copies')) {
        return ok({ sessionId: 'restored-t18', sourceSessionId: 'session-t18', seedLength: 5, durable: true })
      }
      if (path.endsWith('/sessions/session-t18')) return ok({
        replicaId: '701', sessionId: 'session-t18', status: 'DELETED',
        deletedAt: '2026-08-19T06:00:00.000Z',
      })
      throw new Error(`unexpected path ${path}`)
    })
    const api = createEnterpriseLocalApi(fetcher)
    const signal = new AbortController().signal
    await api.sessionSync(signal)
    await api.sessions(signal, 'opaque', 20)
    await api.restoreSession('session-t18', '/tmp/work', signal)
    await api.deleteSession('session-t18', signal)

    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      '/enterprise/api/v1/local/sessions/sync',
      '/enterprise/api/v1/local/sessions?limit=20&cursor=opaque',
      '/enterprise/api/v1/local/sessions/session-t18/copies',
      '/enterprise/api/v1/local/sessions/session-t18',
    ])
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ body: '{"targetCwd":"/tmp/work"}', method: 'POST' })
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({ method: 'DELETE' })
    for (const call of fetcher.mock.calls) {
      expect(new Headers(call[1]?.headers).get('authorization')).toBeNull()
    }
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

  it('decodes status events and closes the browser stream', () => {
    const listeners = new Map<string, EventListener>()
    const close = vi.fn()
    const factory = vi.fn((_url: string) => ({
      addEventListener: (name: string, listener: EventListener) => { listeners.set(name, listener) },
      close,
    }) as unknown as EventSource)
    const onStatus = vi.fn()
    const onSessionSync = vi.fn()
    const onError = vi.fn()
    const stream = createEnterpriseLocalApi(fetch, factory).events(onStatus, onSessionSync, onError)
    listeners.get('status')?.(new MessageEvent('status', { data: JSON.stringify({ ...STATUS, state: 'READY' }) }))
    expect(onStatus).toHaveBeenCalledWith({ ...STATUS, state: 'READY' })
    listeners.get('session-sync')?.(new MessageEvent('session-sync', { data: JSON.stringify(SESSION_SYNC) }))
    expect(onSessionSync).toHaveBeenCalledWith(decodeEnterpriseSessionSyncStatus(SESSION_SYNC))
    stream.close()
    expect(close).toHaveBeenCalledOnce()
  })
})
