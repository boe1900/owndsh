/**
 * [INPUT]: 依赖 Node path/crypto 与 Harness `sessions.create`/`sessions.flush` 的最小结构化 port
 * [OUTPUT]: 对外提供 restoreSessionCopy、SessionSeedEvent、SessionStorePort 和恢复结果
 * [POS]: session-sync 的恢复事务边界，把远端 seed 固化为新本地 ID，绝不覆盖源 Session
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'

export type SessionSeedEvent = Readonly<Record<string, unknown>>

export interface SessionLike {
  readonly id: string
  readonly events?: readonly SessionSeedEvent[]
}

/** Narrow public surface consumed from `ctx.sessions`. */
export interface SessionStorePort {
  create(id: string, options: {
    readonly seed: readonly SessionSeedEvent[]
    readonly meta: {
      readonly cwd: string
      readonly parentSession: string
      readonly seedLength: number
    }
  }): SessionLike
  flush(session: SessionLike): Promise<boolean>
}

export interface RestoreSessionCopyInput {
  readonly sourceSessionId: string
  readonly targetCwd: string
  readonly events: readonly SessionSeedEvent[]
  readonly newSessionId?: string
}

export interface RestoreSessionCopyResult {
  readonly sessionId: string
  readonly sourceSessionId: string
  readonly seedLength: number
  readonly durable: boolean
}

/** Create and flush a new local Session whose lineage points to the remote source. */
export async function restoreSessionCopy(
  sessions: SessionStorePort,
  input: RestoreSessionCopyInput,
): Promise<RestoreSessionCopyResult> {
  if (input.sourceSessionId.length === 0) throw new TypeError('sourceSessionId is required')
  if (!isAbsolute(input.targetCwd)) throw new TypeError('targetCwd must be an absolute path')
  const sessionId = input.newSessionId ?? `enterprise-restored-${randomUUID()}`
  if (sessionId.length === 0 || sessionId === input.sourceSessionId) {
    throw new TypeError('restored Session ID must be non-empty and differ from its source')
  }
  const restored = sessions.create(sessionId, {
    seed: input.events,
    meta: {
      cwd: input.targetCwd,
      parentSession: input.sourceSessionId,
      seedLength: input.events.length,
    },
  })
  const durable = await sessions.flush(restored)
  return {
    sessionId: restored.id,
    sourceSessionId: input.sourceSessionId,
    seedLength: input.events.length,
    durable,
  }
}
