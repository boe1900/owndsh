/**
 * [INPUT]: 接收管理端允许的 actor/action/resource/result/reason/requestId/时间筛选
 * [OUTPUT]: 提供不可变且时间范围自洽的审计查询条件
 * [POS]: audit 查询白名单，Jdbc adapter 只能从这些字段构造参数化谓词
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import java.time.Instant;

public record AuditFilter(
    Long actorId,
    AuditAction action,
    String resourceType,
    String resourceId,
    AuditResult result,
    String reasonCode,
    String requestId,
    Instant from,
    Instant to
) {
    public AuditFilter {
        if (actorId != null && actorId <= 0) throw new IllegalArgumentException("actorId 必须为正数");
        if (from != null && to != null && !from.isBefore(to)) {
            throw new IllegalArgumentException("from 必须早于 to");
        }
    }
}
