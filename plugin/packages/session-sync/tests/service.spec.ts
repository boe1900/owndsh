/**
 * [INPUT]: 依赖 Cordis Context、真实 cursor 临时文件及 fake 官方 Session/Persistence/platform ports
 * [OUTPUT]: 验证非阻塞 dirty queue、flush/readFrom、单 worker、断点续传、退避终态、恢复与 tombstone 删除
 * [POS]: session-sync T17 状态机验收，覆盖本地耐久优先和无半成品恢复两条关键不变量
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type Session, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { BootstrapSnapshot, EnterprisePlatformStatus } from '@owndsh/platform-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EnterpriseSessionSyncService,
  INITIAL_ROLLING_HASH,
  prepareSessionBatch,
  SessionCursorStore,
  type SessionSyncContext,
  type SessionSyncPlatformPort,
} from '../src/index.js'

const REQUEST_ID = `req_${'7'.repeat(26)}`
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

function event(seq: number): SessionEvent {
  return { type: 'session/end-seed', seq, time: seq + 1, data: {} } as SessionEvent
}

function header(id: string): SessionHeader {
  return { version: 0, id: SessionId(id), createdAt: 1, cwd: '/tmp/work' }
}

function bootstrap(enabled = true): BootstrapSnapshot {
  return {
    revision: 1,
    user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
    device: { id: '90018', installationId: '4fbec6ac-05fb-4bc7-8457-709647d9fe76', status: 'ACTIVE' },
    models: [], quotas: [], plugins: { revision: 0, assignments: [] },
    sessionPolicy: { enabled, retentionDays: 90, maxBatchBytes: 1_048_576 },
  }
}

class FakePlatform implements SessionSyncPlatformPort {
  readonly listeners = new Set<(status: EnterprisePlatformStatus) => void>()
  statusValue: EnterprisePlatformStatus = {
    state: 'READY', bundleVersion: '0.1.0', platformUrl: 'https://enterprise.invalid',
    transport: 'webServer.register',
  }
  requestHandler: (input: string | URL, init?: RequestInit) => Promise<Response> = async () => {
    throw new Error('unexpected platform request')
  }

  constructor(public snapshot: BootstrapSnapshot = bootstrap()) {}

  status(): EnterprisePlatformStatus { return { ...this.statusValue } }
  bootstrap(): BootstrapSnapshot { return structuredClone(this.snapshot) }
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  request(input: string | URL, init?: RequestInit): Promise<Response> {
    return this.requestHandler(input, init)
  }
}

function acknowledgement(init: RequestInit | undefined): Response {
  const body = JSON.parse(String(init?.body)) as {
    fromSeq: number
    toSeq: number
    previousRollingHash: string
    payloadBase64: string
  }
  let rolling = Buffer.from(body.previousRollingHash, 'base64')
  const payload = Buffer.from(body.payloadBase64, 'base64')
  let start = 0
  for (let index = 0; index < payload.length; index += 1) {
    if (payload[index] !== 0x0a) continue
    const line = payload.subarray(start, index)
    rolling = requireRollingHash(rolling, line)
    start = index + 1
  }
  return Response.json({
    data: { acceptedThroughSeq: body.toSeq, rollingHash: rolling.toString('base64') },
    requestId: REQUEST_ID,
  })
}

function requireRollingHash(previous: Uint8Array, line: Uint8Array): Buffer {
  return createHash('sha256').update(previous).update(line).digest()
}

interface Environment {
  readonly ctx: Context
  readonly service: EnterpriseSessionSyncService
  readonly platform: FakePlatform
  readonly store: SessionCursorStore
  readonly sessions: {
    get: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  readonly persistence: {
    list: ReturnType<typeof vi.fn>
    readFrom: ReturnType<typeof vi.fn>
  }
  readonly live: Map<string, Session>
  readonly events: Map<string, SessionEvent[]>
  readonly home: string
  close(): Promise<void>
}

async function environment(options: {
  readonly platform?: FakePlatform
  readonly headers?: SessionHeader[]
  readonly events?: Map<string, SessionEvent[]>
  readonly home?: string
  readonly debounceMs?: number
  readonly retryInitialMs?: number
} = {}): Promise<Environment> {
  const home = options.home ?? await mkdtemp(join(tmpdir(), 'enterprise-session-service-'))
  const platform = options.platform ?? new FakePlatform()
  const events = options.events ?? new Map<string, SessionEvent[]>()
  const live = new Map<string, Session>()
  const sessions = {
    get: vi.fn((id: string) => live.get(String(id))),
    flush: vi.fn(async () => true),
    create: vi.fn((id: string) => {
      const session = { id } as Session
      live.set(String(id), session)
      return session
    }),
  }
  const persistence = {
    list: vi.fn(async () => options.headers ?? []),
    readFrom: vi.fn(async (id: string, fromSeq: number) => ({
      meta: header(String(id)),
      events: (events.get(String(id)) ?? []).filter(item => item.seq >= fromSeq),
    })),
  }
  const ctx = new Context()
  ctx.reflect.provide('sessions', sessions as never)
  ctx.reflect.provide('sessionPersistence', persistence as never)
  ctx.reflect.provide('enterprisePlatform', platform as never)
  const store = new SessionCursorStore(home)
  const service = new EnterpriseSessionSyncService(ctx as unknown as SessionSyncContext, {
    debounceMs: options.debounceMs ?? 10,
    retryInitialMs: options.retryInitialMs ?? 20,
    retryMaxMs: 100,
    disposeTimeoutMs: 500,
    maxBatchEvents: 1,
  }, { store })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await service.dispose()
    await ctx.fiber.dispose()
  }
  const result: Environment = { ctx, service, platform, store, sessions, persistence, live, events, home, close }
  cleanups.push(async () => {
    await close()
    if (options.home === undefined) await rm(home, { force: true, recursive: true })
  })
  return result
}

describe('EnterpriseSessionSyncService', () => {
  it('stops the local worker before deleting a remote replica and persists a no-backlog tombstone', async () => {
    const events = new Map<string, SessionEvent[]>([['session-delete', [event(0)]]])
    const env = await environment({ events })
    const live = { id: SessionId('session-delete') } as Session
    env.live.set('session-delete', live)
    const methods: string[] = []
    env.platform.requestHandler = async (_input, init) => {
      methods.push(init?.method ?? 'GET')
      if (init?.method === 'DELETE') {
        return Response.json({
          data: {
            replicaId: '701', sessionId: 'session-delete', status: 'DELETED',
            deletedAt: '2026-08-19T06:00:00.000Z',
          },
          requestId: REQUEST_ID,
        })
      }
      return acknowledgement(init)
    }
    env.ctx.emit('session/event', live, event(0))
    await vi.waitFor(() => {
      expect(env.service.status().cursors[0]).toMatchObject({ state: 'SYNCED', lastAckSeq: 0 })
    })

    await expect(env.service.deleteRemote('session-delete')).resolves.toMatchObject({
      sessionId: 'session-delete', status: 'DELETED',
    })
    expect(env.service.status()).toMatchObject({ backlog: 0, cursors: [{ state: 'DELETED' }] })
    env.ctx.emit('session/event', live, event(1))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(methods).toEqual(['POST', 'DELETE'])
    await expect(env.store.read()).resolves.toMatchObject({ sessions: [{ state: 'DELETED' }] })
  })

  it('persists a tombstone when deletion wins the race with the first debounced upload', async () => {
    const events = new Map<string, SessionEvent[]>([['session-delete-pending', [event(0)]]])
    const env = await environment({ events, debounceMs: 1_000 })
    const live = { id: SessionId('session-delete-pending') } as Session
    env.live.set('session-delete-pending', live)
    const methods: string[] = []
    env.platform.requestHandler = async (_input, init) => {
      methods.push(init?.method ?? 'GET')
      return Response.json({
        data: {
          replicaId: '702', sessionId: 'session-delete-pending', status: 'DELETED',
          deletedAt: '2026-08-19T06:01:00.000Z',
        },
        requestId: REQUEST_ID,
      })
    }
    env.ctx.emit('session/event', live, event(0))
    expect(env.service.status()).toMatchObject({ backlog: 1, cursors: [] })

    await expect(env.service.deleteRemote('session-delete-pending')).resolves.toMatchObject({
      sessionId: 'session-delete-pending', status: 'DELETED',
    })
    expect(methods).toEqual(['DELETE'])
    expect(env.service.status()).toMatchObject({
      backlog: 0,
      cursors: [{ state: 'DELETED', lastAckSeq: -1, rollingHash: INITIAL_ROLLING_HASH.toString('base64') }],
    })
    await expect(env.store.read()).resolves.toMatchObject({ sessions: [{ state: 'DELETED', lastAckSeq: -1 }] })
    env.ctx.emit('session/event', live, event(1))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(methods).toEqual(['DELETE'])
  })

  it('maps a malformed delete acknowledgement to a stable divergence error', async () => {
    const env = await environment()
    env.platform.requestHandler = async () => Response.json({
      data: {
        replicaId: '701', sessionId: 'session-delete', status: 'DELETED',
        deletedAt: 'not-rfc-3339',
      },
      requestId: REQUEST_ID,
    })

    await expect(env.service.deleteRemote('session-delete')).rejects.toMatchObject({
      code: 'ENT_SESSION_DIVERGED', retryable: false, httpStatus: 200,
    })
  })

  it('keeps append notification non-blocking and serializes dirty work after flush/readFrom', async () => {
    const events = new Map<string, SessionEvent[]>([['session-live', [event(0)]]])
    const env = await environment({ events })
    const live = { id: SessionId('session-live') } as Session
    env.live.set('session-live', live)
    const order: string[] = []
    env.sessions.flush.mockImplementation(async () => { order.push('flush'); return true })
    env.persistence.readFrom.mockImplementation(async (_id: string, fromSeq: number) => {
      order.push(`read:${fromSeq}`)
      return { meta: header('session-live'), events: (events.get('session-live') ?? []).filter(item => item.seq >= fromSeq) }
    })
    let release: (() => void) | undefined
    let active = 0
    let maxActive = 0
    const requests: RequestInit[] = []
    env.platform.requestHandler = async (_input, init) => {
      requests.push(init ?? {})
      active += 1
      maxActive = Math.max(maxActive, active)
      order.push('request')
      if (requests.length === 1) await new Promise<void>(resolve => { release = resolve })
      active -= 1
      return acknowledgement(init)
    }

    env.ctx.emit('session/event', live, event(0))
    expect(requests).toHaveLength(0)
    await vi.waitFor(() => { expect(requests).toHaveLength(1) })
    events.get('session-live')?.push(event(1))
    env.ctx.emit('session/event', live, event(1))
    release?.()
    await vi.waitFor(() => {
      expect(env.service.status().cursors[0]).toMatchObject({ state: 'SYNCED', lastAckSeq: 1 })
    })
    expect(requests).toHaveLength(2)
    expect(maxActive).toBe(1)
    expect(order.slice(0, 3)).toEqual(['flush', 'read:0', 'request'])
    expect(env.sessions.flush).toHaveBeenCalledTimes(2)
  })

  it('discovers persisted sessions and resumes strictly after the durable acknowledgement cursor', async () => {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-session-resume-'))
    const first = prepareSessionBatch({
      sourceDeviceId: '90018', meta: header('session-resume'), events: [event(0)],
      previousRollingHash: INITIAL_ROLLING_HASH.toString('base64'), maxBatchBytes: 4096, maxBatchEvents: 1,
    })
    await new SessionCursorStore(home).write({
      formatVersion: 1,
      sessions: [{
        sessionId: 'session-resume', sourceDeviceId: '90018', lastAckSeq: 0,
        rollingHash: first.resultHash, state: 'RETRY_WAIT', lastErrorCode: 'ENT_PLATFORM_UNAVAILABLE',
        updatedAt: '2026-08-19T00:00:00.000Z', lastSuccessAt: '2026-08-19T00:00:00.000Z',
      }],
    })
    const requests: RequestInit[] = []
    const platform = new FakePlatform()
    platform.requestHandler = async (_input, init) => {
      requests.push(init ?? {})
      return acknowledgement(init)
    }
    const env = await environment({
      home, platform, headers: [header('session-resume')],
      events: new Map([['session-resume', [event(0), event(1)]]]),
    })
    cleanups.push(() => rm(home, { force: true, recursive: true }))
    await vi.waitFor(() => {
      expect(env.service.status().cursors[0]).toMatchObject({ state: 'SYNCED', lastAckSeq: 1 })
    })
    expect(env.persistence.readFrom).toHaveBeenCalledWith('session-resume', 1, expect.any(AbortSignal))
    expect(JSON.parse(String(requests[0]?.body))).toMatchObject({ fromSeq: 1, header: null })
  })

  it('backs off retryable failures and makes sequence gaps visible terminal states', async () => {
    const retryEvents = new Map([['session-retry', [event(0)]]])
    const retryPlatform = new FakePlatform()
    let attempts = 0
    retryPlatform.requestHandler = async (_input, init) => {
      attempts += 1
      if (attempts === 1) throw Object.assign(new Error('offline'), {
        code: 'ENT_PLATFORM_UNAVAILABLE', retryable: true, httpStatus: 503,
      })
      return acknowledgement(init)
    }
    const retry = await environment({ platform: retryPlatform, events: retryEvents, retryInitialMs: 80 })
    const retryLive = { id: SessionId('session-retry') } as Session
    retry.live.set('session-retry', retryLive)
    retry.ctx.emit('session/event', retryLive, event(0))
    await vi.waitFor(() => {
      expect(retry.service.status().cursors[0]).toMatchObject({ state: 'RETRY_WAIT', lastAckSeq: -1 })
    })
    await vi.waitFor(() => {
      expect(retry.service.status().cursors[0]).toMatchObject({ state: 'SYNCED', lastAckSeq: 0 })
    })
    expect(attempts).toBe(2)

    const gapEvents = new Map([['session-gap', [event(0)]]])
    const gapPlatform = new FakePlatform()
    const gapRequest = vi.fn(async () => {
      throw Object.assign(new Error('gap'), { code: 'ENT_SESSION_SEQ_GAP', retryable: false, httpStatus: 409 })
    })
    gapPlatform.requestHandler = gapRequest
    const gap = await environment({ platform: gapPlatform, events: gapEvents })
    const gapLive = { id: SessionId('session-gap') } as Session
    gap.live.set('session-gap', gapLive)
    gap.ctx.emit('session/event', gapLive, event(0))
    await vi.waitFor(() => {
      expect(gap.service.status().cursors[0]).toMatchObject({ state: 'SEQ_GAP', lastErrorCode: 'ENT_SESSION_SEQ_GAP' })
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(gapRequest).toHaveBeenCalledOnce()
  })

  it('validates every export page before creating a new durable Session and records the lineage', async () => {
    const sourceHeader = header('remote-source')
    const first = prepareSessionBatch({
      sourceDeviceId: '90018', meta: sourceHeader, events: [event(0)],
      previousRollingHash: INITIAL_ROLLING_HASH.toString('base64'), maxBatchBytes: 4096, maxBatchEvents: 1,
    })
    const second = prepareSessionBatch({
      sourceDeviceId: '90018', meta: sourceHeader, events: [event(1)],
      previousRollingHash: first.resultHash, maxBatchBytes: 4096, maxBatchEvents: 1,
    })
    const page = (batch: typeof first, hasMore: boolean) => ({
      sessionId: 'remote-source', header: batch.body.header ?? first.body.header!, title: null,
      fromSeq: batch.body.fromSeq, toSeq: batch.body.toSeq, eventCount: batch.eventCount,
      previousRollingHash: batch.body.previousRollingHash, rollingHash: batch.resultHash,
      payloadSha256: batch.body.payloadSha256, payloadBase64: batch.body.payloadBase64, hasMore,
    })
    const platform = new FakePlatform(bootstrap(false))
    const requests: string[] = []
    platform.requestHandler = async (input, init) => {
      const path = input.toString()
      requests.push(path)
      if (path.includes('/export?fromSeq=0')) {
        return Response.json({ data: page(first, true), requestId: REQUEST_ID })
      }
      if (path.includes('/export?fromSeq=1')) {
        return Response.json({ data: page(second, false), requestId: REQUEST_ID })
      }
      if (path.endsWith('/restore-record')) {
        const body = JSON.parse(String(init?.body)) as { restoredSessionId: string }
        return Response.json({
          data: { sourceSessionId: 'remote-source', restoredSessionId: body.restoredSessionId,
            recordedAt: '2026-08-19T00:00:00.000Z' },
          requestId: REQUEST_ID,
        })
      }
      throw new Error(`unexpected path ${path}`)
    }
    const env = await environment({ platform })
    await expect(env.service.restoreRemote({
      sourceSessionId: 'remote-source', targetCwd: env.home, newSessionId: 'restored-copy',
    })).resolves.toEqual({
      sessionId: 'restored-copy', sourceSessionId: 'remote-source', seedLength: 2, durable: true,
    })
    expect(env.sessions.create).toHaveBeenCalledWith('restored-copy', {
      seed: [event(0), event(1)],
      meta: { cwd: env.home, parentSession: 'remote-source', seedLength: 2 },
    })
    expect(env.sessions.flush).toHaveBeenCalledOnce()
    expect(requests.at(-1)).toMatch(/restore-record$/)

    env.sessions.create.mockClear()
    platform.requestHandler = async (input) => {
      const path = input.toString()
      if (path.includes('/export?fromSeq=0')) {
        return Response.json({ data: page(first, true), requestId: REQUEST_ID })
      }
      return Response.json({
        data: { ...page(second, false), rollingHash: INITIAL_ROLLING_HASH.toString('base64') },
        requestId: REQUEST_ID,
      })
    }
    await expect(env.service.restoreRemote({
      sourceSessionId: 'remote-source', targetCwd: env.home, newSessionId: 'must-not-exist',
    })).rejects.toMatchObject({ code: 'ENT_SESSION_DIVERGED' })
    expect(env.sessions.create).not.toHaveBeenCalled()
  })
})
