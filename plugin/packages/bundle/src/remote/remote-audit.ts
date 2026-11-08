/**
 * [INPUT]: 依赖 Host logger 或产品审计回调，以及 Remote lifecycle 事件。
 * [OUTPUT]: 提供不含 Token、密文或业务正文的 Remote 诊断事件 sink。
 * [POS]: bundle/remote 的观测边界；诊断只记录 link/device 状态和稳定错误码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export interface RemoteAuditEvent {
  readonly action: 'REMOTE_CONNECTED' | 'REMOTE_CLOSED' | 'REMOTE_REVOKED' | 'REMOTE_PROTOCOL_ERROR'
  readonly linkId?: string
  readonly deviceId?: string
  readonly code?: string
  readonly occurredAt: string
}

export type RemoteAuditSink = (event: RemoteAuditEvent) => void

export function auditRemoteEvent(sink: RemoteAuditSink, event: Omit<RemoteAuditEvent, 'occurredAt'>): void {
  sink({ ...event, occurredAt: new Date().toISOString() })
}
