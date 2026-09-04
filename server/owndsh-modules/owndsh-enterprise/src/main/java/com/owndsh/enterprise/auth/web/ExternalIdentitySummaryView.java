/**
 * [INPUT]: 依赖 ExternalIdentitySummary 脱敏领域投影
 * [OUTPUT]: 提供字符串 snowflake sourceId、类型、稳定 subject 和最后登录 JSON DTO
 * [POS]: auth/web 的用户身份摘要协议视图，不暴露 groups、claims 或任何凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import com.owndsh.enterprise.auth.domain.ExternalIdentitySummary;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;

import java.time.Instant;

public record ExternalIdentitySummaryView(
    String sourceId,
    String sourceName,
    IdentitySourceType sourceType,
    String externalSubject,
    Instant lastLoginAt
) {
    public static ExternalIdentitySummaryView from(ExternalIdentitySummary summary) {
        return new ExternalIdentitySummaryView(
            Long.toString(summary.sourceId()),
            summary.sourceName(),
            summary.sourceType(),
            summary.externalSubject(),
            summary.lastLoginAt()
        );
    }
}
