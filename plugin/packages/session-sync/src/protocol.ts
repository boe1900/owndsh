/**
 * [INPUT]: 依赖 Node SHA-256、官方 format v0 SessionHeader/Event 与 T16 HTTP DTO
 * [OUTPUT]: 对外提供精确 JSONL 上传切批、rolling hash、canonical Base64 和恢复页验证
 * [POS]: session-sync 的纯字节协议核心，网络 worker 与恢复事务共享同一 hash 实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from 'node:crypto'
import { SESSION_FORMAT_VERSION, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionBatchRequest, SessionExport } from '@owndsh/contracts'
import { SessionSyncError } from './errors.js'

export const INITIAL_ROLLING_HASH = Buffer.alloc(32)
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER

export interface PreparedSessionBatch {
  readonly body: SessionBatchRequest
  readonly eventCount: number
  readonly resultHash: string
}

export interface VerifiedExportPage {
  readonly events: readonly SessionEvent[]
  readonly header: SessionHeader
  readonly nextSeq: number
  readonly rollingHash: string
  readonly hasMore: boolean
}

function sha256(value: Uint8Array): Buffer {
  return createHash('sha256').update(value).digest()
}

function canonicalHash(value: string, name: string): Buffer {
  if (value.length !== 44 || value[43] !== '=') {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', `${name} is not canonical Base64`)
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.byteLength !== 32 || decoded.toString('base64') !== value) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', `${name} is not a 32-byte canonical hash`)
  }
  return decoded
}

function requireSequence(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', `${name} must be a non-negative safe integer`)
  }
  return Number(value)
}

function serializeEvent(event: SessionEvent, expectedSeq: number): Buffer {
  if (requireSequence(event.seq, 'event.seq') !== expectedSeq
    || typeof event.type !== 'string' || event.type.length === 0
    || requireSequence(event.time, 'event.time') !== event.time
    || !Object.hasOwn(event, 'data')) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', 'local Session event envelope is invalid')
  }
  let text: string | undefined
  try {
    text = JSON.stringify(event)
  } catch (error) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', 'local Session event is not JSON serializable', false,
      undefined, { cause: error })
  }
  if (text === undefined || text.includes('\n') || text.includes('\r')) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', 'local Session event JSON line is invalid')
  }
  return Buffer.from(text, 'utf8')
}

function sessionHeaderForWire(header: SessionHeader): NonNullable<SessionBatchRequest['header']> {
  if (header.version !== SESSION_FORMAT_VERSION) {
    throw new SessionSyncError('ENT_SESSION_FORMAT_UNSUPPORTED', 'local Session format is unsupported')
  }
  return {
    version: SESSION_FORMAT_VERSION,
    id: String(header.id),
    createdAt: header.createdAt,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    ...(header.parentSession === undefined ? {} : { parentSession: String(header.parentSession) }),
    ...(header.seedLength === undefined ? {} : { seedLength: header.seedLength }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    ...(header.delegationDepth === undefined ? {} : { delegationDepth: header.delegationDepth }),
    ...(header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
  }
}

export function advanceRollingHash(previous: Uint8Array, rawLine: Uint8Array): Buffer {
  return createHash('sha256').update(previous).update(rawLine).digest()
}

/** 从已持久化连续后缀创建一个受事件数和明文字节数双重约束的上传批次。 */
export function prepareSessionBatch(input: {
  readonly sourceDeviceId: string
  readonly meta: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly previousRollingHash: string
  readonly maxBatchBytes: number
  readonly maxBatchEvents: number
}): PreparedSessionBatch {
  if (input.meta.version !== SESSION_FORMAT_VERSION) {
    throw new SessionSyncError('ENT_SESSION_FORMAT_UNSUPPORTED', 'local Session format is unsupported')
  }
  if (input.events.length === 0) throw new TypeError('events must not be empty')
  if (!Number.isSafeInteger(input.maxBatchBytes) || input.maxBatchBytes <= 0
    || !Number.isSafeInteger(input.maxBatchEvents) || input.maxBatchEvents <= 0) {
    throw new TypeError('batch limits must be positive safe integers')
  }
  const fromSeq = requireSequence(input.events[0]?.seq, 'fromSeq')
  let rolling = canonicalHash(input.previousRollingHash, 'previousRollingHash')
  const lines: Buffer[] = []
  let payloadBytes = 0
  for (const event of input.events) {
    if (lines.length >= input.maxBatchEvents) break
    const line = serializeEvent(event, fromSeq + lines.length)
    const lineBytes = line.byteLength + 1
    if (payloadBytes + lineBytes > input.maxBatchBytes) break
    lines.push(line)
    payloadBytes += lineBytes
    rolling = advanceRollingHash(rolling, line)
  }
  if (lines.length === 0) {
    throw new SessionSyncError('ENT_SESSION_BATCH_TOO_LARGE', 'one Session event exceeds maxBatchBytes')
  }
  const payload = Buffer.allocUnsafe(payloadBytes)
  let offset = 0
  for (const line of lines) {
    offset += line.copy(payload, offset)
    payload[offset++] = 0x0a
  }
  const toSeq = fromSeq + lines.length - 1
  const resultHash = rolling.toString('base64')
  return {
    body: {
      idempotencyKey: `${input.sourceDeviceId}:${String(input.meta.id)}:${fromSeq}:${toSeq}`,
      fromSeq,
      toSeq,
      previousRollingHash: input.previousRollingHash,
      payloadSha256: sha256(payload).toString('base64'),
      payloadBase64: payload.toString('base64'),
      header: fromSeq === 0 ? sessionHeaderForWire(input.meta) : null,
      title: null,
    },
    eventCount: lines.length,
    resultHash,
  }
}

function parsePayload(payloadBase64: string): { readonly lines: Buffer[]; readonly payload: Buffer } {
  const payload = Buffer.from(payloadBase64, 'base64')
  if (payload.byteLength === 0 || payload.toString('base64') !== payloadBase64 || payload.at(-1) !== 0x0a) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session payload encoding is invalid')
  }
  const lines: Buffer[] = []
  let start = 0
  for (let index = 0; index < payload.byteLength; index += 1) {
    if (payload[index] !== 0x0a) continue
    if (index === start || payload[index - 1] === 0x0d) {
      throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session payload is not canonical JSONL')
    }
    lines.push(payload.subarray(start, index))
    start = index + 1
  }
  return { lines, payload }
}

/** 在创建本地副本前验证一页完整的 seq/payload/hash/format 证明。 */
export function verifySessionExportPage(
  page: SessionExport,
  expectedSessionId: string,
  expectedFromSeq: number,
  expectedPreviousHash: string,
): VerifiedExportPage {
  if (page.sessionId !== expectedSessionId || page.fromSeq !== expectedFromSeq
    || page.previousRollingHash !== expectedPreviousHash || page.header.version !== SESSION_FORMAT_VERSION
    || page.header.id !== expectedSessionId) {
    throw new SessionSyncError(
      page.header.version === SESSION_FORMAT_VERSION
        ? 'ENT_SESSION_DIVERGED'
        : 'ENT_SESSION_FORMAT_UNSUPPORTED',
      'remote Session page identity or format is invalid',
    )
  }
  const { lines, payload } = parsePayload(page.payloadBase64)
  if (sha256(payload).toString('base64') !== page.payloadSha256 || lines.length !== page.eventCount
    || page.toSeq !== page.fromSeq + page.eventCount - 1) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session page range or payload hash is invalid')
  }
  let rolling = canonicalHash(expectedPreviousHash, 'previousRollingHash')
  const events: SessionEvent[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session line is missing')
    let value: unknown
    try {
      value = JSON.parse(line.toString('utf8'))
    } catch (error) {
      throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session event is invalid JSON', false,
        undefined, { cause: error })
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session event is not an object')
    }
    const event = value as Record<string, unknown>
    const expectedSeq = expectedFromSeq + index
    if (requireSequence(event['seq'], 'event.seq') !== expectedSeq
      || typeof event['type'] !== 'string' || event['type'].length === 0
      || requireSequence(event['time'], 'event.time') !== event['time']
      || !Object.hasOwn(event, 'data')) {
      throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session event envelope is invalid')
    }
    rolling = advanceRollingHash(rolling, line)
    events.push(value as SessionEvent)
  }
  const rollingHash = rolling.toString('base64')
  if (rollingHash !== page.rollingHash) {
    throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session rolling hash is invalid')
  }
  return {
    events,
    header: page.header as SessionHeader,
    nextSeq: page.toSeq + 1,
    rollingHash,
    hasMore: page.hasMore,
  }
}
