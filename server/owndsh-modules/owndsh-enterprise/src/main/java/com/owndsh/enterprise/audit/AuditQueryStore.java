/**
 * [INPUT]: 接收固定 tenant、解密后的时间/ID 倒序位置、白名单筛选与保留截止时间
 * [OUTPUT]: 提供只读审计分页和唯一受控的 retention 删除能力
 * [POS]: audit application 到 PostgreSQL 的 DIP 端口；普通业务仍只能依赖 append-only AuditSink
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import com.owndsh.enterprise.common.api.EnterpriseCursorCodec.TimePosition;

import java.time.Instant;
import java.util.List;

public interface AuditQueryStore {
    List<AuditEventRecord> list(String tenantId, TimePosition before, int limit, AuditFilter filter);

    int deleteBefore(String tenantId, Instant cutoff, int limit);
}
