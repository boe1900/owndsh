/**
 * [INPUT]: 依赖 session-sync 精确 JSONL、SHA-256、rolling hash 和远端页验证原语
 * [OUTPUT]: 验证事件数/字节切批、header v0 投影、canonical Base64 与篡改拒绝
 * [POS]: session-sync 线协议回归测试，确保客户端字节事实与 T16 Server 完全同构
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from 'node:crypto'
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import {
  INITIAL_ROLLING_HASH,
  prepareSessionBatch,
  verifySessionExportPage,
} from '../src/index.js'

const header: SessionHeader = {
  version: 0,
  id: SessionId('session-protocol'),
  createdAt: 1,
  cwd: '/tmp/work',
  parentSession: SessionId('parent-1'),
  seedLength: 1,
  agentPreset: 'enterprise',
}

function event(seq: number): SessionEvent {
  return { type: 'session/end-seed', seq, time: seq + 10, data: {} } as SessionEvent
}

describe('Session sync wire protocol', () => {
  it('uses exact JSON.stringify plus LF bytes and advances one canonical rolling hash per line', () => {
    const events = [event(0), event(1)]
    const firstLine = Buffer.from(`${JSON.stringify(events[0])}\n`)
    const first = prepareSessionBatch({
      sourceDeviceId: '90018',
      meta: header,
      events,
      previousRollingHash: INITIAL_ROLLING_HASH.toString('base64'),
      maxBatchBytes: firstLine.byteLength,
      maxBatchEvents: 2,
    })
    expect(first.eventCount).toBe(1)
    expect(Buffer.from(first.body.payloadBase64, 'base64')).toEqual(firstLine)
    expect(first.body.payloadSha256).toBe(createHash('sha256').update(firstLine).digest('base64'))
    expect(first.body.header).toEqual({
      version: 0,
      id: 'session-protocol',
      createdAt: 1,
      cwd: '/tmp/work',
      parentSession: 'parent-1',
      seedLength: 1,
      agentPreset: 'enterprise',
    })
    expect(first.body.idempotencyKey).toBe('90018:session-protocol:0:0')

    const second = prepareSessionBatch({
      sourceDeviceId: '90018',
      meta: header,
      events: events.slice(1),
      previousRollingHash: first.resultHash,
      maxBatchBytes: 1024,
      maxBatchEvents: 1,
    })
    expect(second.body.header).toBeNull()
    expect(second.body.fromSeq).toBe(1)
    expect(second.resultHash).not.toBe(first.resultHash)
  })

  it('validates a complete export proof and rejects hash or byte-boundary tampering', () => {
    const prepared = prepareSessionBatch({
      sourceDeviceId: '90018',
      meta: header,
      events: [event(0), event(1)],
      previousRollingHash: INITIAL_ROLLING_HASH.toString('base64'),
      maxBatchBytes: 4096,
      maxBatchEvents: 200,
    })
    const page = {
      sessionId: 'session-protocol',
      header: prepared.body.header!,
      title: null,
      fromSeq: prepared.body.fromSeq,
      toSeq: prepared.body.toSeq,
      eventCount: prepared.eventCount,
      previousRollingHash: prepared.body.previousRollingHash,
      rollingHash: prepared.resultHash,
      payloadSha256: prepared.body.payloadSha256,
      payloadBase64: prepared.body.payloadBase64,
      hasMore: false,
    }
    expect(verifySessionExportPage(page, 'session-protocol', 0, page.previousRollingHash)).toMatchObject({
      nextSeq: 2,
      rollingHash: prepared.resultHash,
      hasMore: false,
    })
    expect(() => verifySessionExportPage(
      { ...page, rollingHash: INITIAL_ROLLING_HASH.toString('base64') },
      'session-protocol', 0, page.previousRollingHash,
    )).toThrow(/rolling hash/)
    const bytes = Buffer.from(page.payloadBase64, 'base64').subarray(0, -1)
    expect(() => verifySessionExportPage(
      { ...page, payloadBase64: bytes.toString('base64') },
      'session-protocol', 0, page.previousRollingHash,
    )).toThrow(/encoding/)
  })

  it('rejects a single event larger than the configured batch boundary', () => {
    expect(() => prepareSessionBatch({
      sourceDeviceId: '90018',
      meta: header,
      events: [event(0)],
      previousRollingHash: INITIAL_ROLLING_HASH.toString('base64'),
      maxBatchBytes: 1,
      maxBatchEvents: 1,
    })).toThrow(/exceeds maxBatchBytes/)
  })
})
