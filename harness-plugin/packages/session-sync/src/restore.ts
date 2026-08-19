/**
 * [INPUT]: 依赖 Node path/crypto 与官方 `sessions.create`/`sessions.flush` Service
 * [OUTPUT]: 对外提供新 ID、完整 seed、lineage 和 durability checkpoint 的恢复事务
 * [POS]: session-sync 的本地创建边界，只消费已被 protocol 完整验证的远端事件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'

/** `ctx.sessions` 中恢复事务实际使用的官方窄接口。 */
export interface SessionStorePort {
  create(id: ReturnType<typeof SessionId>, options: {
    readonly seed: readonly SessionEvent[]
    readonly meta: {
      readonly cwd: string
      readonly parentSession: ReturnType<typeof SessionId>
      readonly seedLength: number
    }
  }): Session
  flush(session: Session): Promise<boolean>
}

export interface RestoreSessionCopyInput {
  readonly sourceSessionId: string
  readonly targetCwd: string
  readonly events: readonly SessionEvent[]
  readonly newSessionId?: string
}

export interface RestoreSessionCopyResult {
  readonly sessionId: string
  readonly sourceSessionId: string
  readonly seedLength: number
  readonly durable: boolean
}

/** 以新 ID 创建 lineage-bound Session，并只通过官方 flush 请求持久化。 */
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
  const restored = sessions.create(SessionId(sessionId), {
    seed: input.events,
    meta: {
      cwd: input.targetCwd,
      parentSession: SessionId(input.sourceSessionId),
      seedLength: input.events.length,
    },
  })
  const durable = await sessions.flush(restored)
  return {
    sessionId: String(restored.id),
    sourceSessionId: input.sourceSessionId,
    seedLength: input.events.length,
    durable,
  }
}
