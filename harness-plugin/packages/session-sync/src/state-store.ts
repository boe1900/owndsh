/**
 * [INPUT]: 依赖 Node fs/path/crypto 与无正文 SessionCursorFile 契约
 * [OUTPUT]: 对外提供 SessionCursorStore、严格解析、空状态和固定 cursor 路径
 * [POS]: session-sync 的唯一磁盘边界，以 0600 临时文件加 rename 防止确认游标半写
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { resolveEnterpriseDshHome } from '@enterprise-agent/dsh-platform-client'
import { SessionSyncError } from './errors.js'
import type { SessionCursorFile, SessionCursorRecord, SessionCursorState } from './types.js'

const STATES = new Set<SessionCursorState>([
  'PENDING', 'SYNCING', 'RETRY_WAIT', 'SYNCED', 'SEQ_GAP', 'DIVERGED',
  'SOURCE_DEVICE_CONFLICT', 'FORMAT_UNSUPPORTED', 'CONTENT_EXPIRED', 'DELETED', 'FAILED',
])
const HASH = /^[A-Za-z0-9+/]{43}=$/
const DEVICE_ID = /^[1-9][0-9]{0,18}$/

export function emptySessionCursorFile(): SessionCursorFile {
  return { formatVersion: 1, sessions: [] }
}

export function resolveSessionCursorPath(dshHome?: string): string {
  return join(resolveEnterpriseDshHome(dshHome === undefined ? {} : { dshHome }), 'enterprise', 'session-sync.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function parseCursor(value: unknown): SessionCursorRecord {
  if (!isRecord(value)
    || Object.keys(value).sort().join(',')
      !== 'lastAckSeq,lastErrorCode,lastSuccessAt,rollingHash,sessionId,sourceDeviceId,state,updatedAt'
    || typeof value['sessionId'] !== 'string' || value['sessionId'].length === 0 || value['sessionId'].length > 128
    || typeof value['sourceDeviceId'] !== 'string' || !DEVICE_ID.test(value['sourceDeviceId'])
    || !Number.isSafeInteger(value['lastAckSeq']) || Number(value['lastAckSeq']) < -1
    || typeof value['rollingHash'] !== 'string' || !HASH.test(value['rollingHash'])
    || Buffer.from(value['rollingHash'], 'base64').toString('base64') !== value['rollingHash']
    || typeof value['state'] !== 'string' || !STATES.has(value['state'] as SessionCursorState)
    || value['lastErrorCode'] !== null && (
      typeof value['lastErrorCode'] !== 'string' || value['lastErrorCode'].length === 0
      || value['lastErrorCode'].length > 64
    )
    || typeof value['updatedAt'] !== 'string' || !Number.isFinite(Date.parse(value['updatedAt']))
    || !nullableTimestamp(value['lastSuccessAt'])) {
    throw new SessionSyncError('ENT_SESSION_STATE_INVALID', 'Session cursor record is invalid')
  }
  return {
    sessionId: value['sessionId'],
    sourceDeviceId: value['sourceDeviceId'],
    lastAckSeq: Number(value['lastAckSeq']),
    rollingHash: value['rollingHash'],
    state: value['state'] as SessionCursorState,
    lastErrorCode: value['lastErrorCode'],
    updatedAt: value['updatedAt'],
    lastSuccessAt: value['lastSuccessAt'],
  }
}

function parseFile(text: string): SessionCursorFile {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new SessionSyncError('ENT_SESSION_STATE_INVALID', 'Session cursor file is not JSON', false,
      undefined, { cause: error })
  }
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'formatVersion,sessions'
    || value['formatVersion'] !== 1 || !Array.isArray(value['sessions'])) {
    throw new SessionSyncError('ENT_SESSION_STATE_INVALID', 'Session cursor file root is invalid')
  }
  const sessions = value['sessions'].map(parseCursor)
  if (new Set(sessions.map(cursor => cursor.sessionId)).size !== sessions.length) {
    throw new SessionSyncError('ENT_SESSION_STATE_INVALID', 'Session cursor IDs must be unique')
  }
  return { formatVersion: 1, sessions }
}

/** 原子读写不含 Session 正文的确认游标文件。 */
export class SessionCursorStore {
  readonly path: string

  constructor(dshHome?: string) {
    this.path = resolveSessionCursorPath(dshHome)
  }

  async read(): Promise<SessionCursorFile> {
    try {
      return parseFile(await readFile(this.path, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptySessionCursorFile()
      throw error
    }
  }

  async write(value: SessionCursorFile): Promise<void> {
    const directory = dirname(this.path)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = join(directory, `.session-sync.${process.pid}.${randomUUID()}.tmp`)
    const normalized: SessionCursorFile = {
      formatVersion: 1,
      sessions: [...value.sessions].sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
    }
    try {
      await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.path)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}
