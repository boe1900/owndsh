/**
 * [INPUT]: 依赖 session-sync restoreSessionCopy 与内存 SessionStorePort test double
 * [OUTPUT]: 验证新 ID、完整 seed、lineage、flush 以及失败前置条件
 * [POS]: session-sync 恢复事务回归测试，防止覆盖源 Session 或创建错误 cwd 半成品
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import { Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  restoreSessionCopy,
  type SessionStorePort,
} from '../src/index.js'

describe('restoreSessionCopy', () => {
  it('creates a new lineage-bound Session from the exact seed and flushes it', async () => {
    const events: SessionEvent[] = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      {
        type: 'user/message', seq: 1, time: 2,
        data: {
          id: 'restore-user-message', role: 'user',
          content: [{ type: 'text', text: 'restore me' }], source: { kind: 'user' },
        },
        surfaceOp: 'append',
      },
      { type: 'turn/end', seq: 2, time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    const create = vi.fn<SessionStorePort['create']>((id, options) => Session.create(id, options.seed, {
      version: 0,
      id,
      createdAt: 1,
      ...options.meta,
    }))
    const flush = vi.fn(async () => true)
    const sessions: SessionStorePort = { create, flush }
    await expect(restoreSessionCopy(sessions, {
      sourceSessionId: 'remote-1',
      targetCwd: '/tmp/work',
      events,
      newSessionId: 'local-copy-1',
    })).resolves.toEqual({
      sessionId: 'local-copy-1',
      sourceSessionId: 'remote-1',
      seedLength: 3,
      durable: true,
    })
    expect(create).toHaveBeenCalledWith('local-copy-1', {
      seed: events,
      meta: { cwd: '/tmp/work', parentSession: 'remote-1', seedLength: 3 },
    })
    expect(flush).toHaveBeenCalledOnce()
    expect(create.mock.results[0]?.value.events.slice(0, events.length)).toEqual(events)
  })

  it('rejects invalid identity or cwd before creating a Session', async () => {
    const sessions: SessionStorePort = {
      create: vi.fn(),
      flush: vi.fn(),
    }
    await expect(restoreSessionCopy(sessions, {
      sourceSessionId: 'same',
      targetCwd: 'relative',
      events: [],
      newSessionId: 'same',
    })).rejects.toThrow('targetCwd must be an absolute path')
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('does not flush when Session creation rejects the seed', async () => {
    const sessions: SessionStorePort = {
      create: vi.fn(() => { throw new Error('invalid seed') }),
      flush: vi.fn(),
    }
    await expect(restoreSessionCopy(sessions, {
      sourceSessionId: 'remote-1',
      targetCwd: '/tmp/work',
      events: [],
    })).rejects.toThrow('invalid seed')
    expect(sessions.flush).not.toHaveBeenCalled()
  })
})
