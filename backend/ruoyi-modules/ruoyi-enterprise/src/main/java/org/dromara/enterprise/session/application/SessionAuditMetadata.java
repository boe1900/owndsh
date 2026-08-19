/**
 * [INPUT]: 依赖 Session 六类审计 action 的非正文事实。
 * [OUTPUT]: 对外提供 append/export/restore/content-read/delete/expire 的显式 metadata 白名单。
 * [POS]: session 到 audit JSONB 的唯一 metadata 边界，禁止 header、title 和 event line 进入审计。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.application;

import org.dromara.enterprise.audit.AuditMetadata;

public sealed interface SessionAuditMetadata extends AuditMetadata permits
    SessionAuditMetadata.BatchAppended,
    SessionAuditMetadata.Exported,
    SessionAuditMetadata.Restored,
    SessionAuditMetadata.ContentRead,
    SessionAuditMetadata.Deleted,
    SessionAuditMetadata.Expired {

    record BatchAppended(long fromSeq, long toSeq, int eventCount) implements SessionAuditMetadata {
    }

    record Exported(long fromSeq, long toSeq, int eventCount) implements SessionAuditMetadata {
    }

    record Restored(String restoredSessionId, long eventCount) implements SessionAuditMetadata {
    }

    record ContentRead(long fromSeq, long toSeq, int eventCount) implements SessionAuditMetadata {
    }

    record Deleted(String previousStatus, long eventCount) implements SessionAuditMetadata {
    }

    record Expired(long lastSeq, long eventCount) implements SessionAuditMetadata {
    }
}
