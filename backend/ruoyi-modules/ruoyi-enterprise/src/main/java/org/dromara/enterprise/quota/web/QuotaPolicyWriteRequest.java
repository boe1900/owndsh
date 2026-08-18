/**
 * [INPUT]: 反序列化 quota policy 管理写请求的显式 nullable 限额字段。
 * [OUTPUT]: 对外提供到 QuotaPolicySpec 的唯一转换。
 * [POS]: quota/web 的请求边界，null 保持“该策略不施加此上限”语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import org.dromara.enterprise.quota.application.QuotaPolicySpec;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;

public record QuotaPolicyWriteRequest(
    String name,
    QuotaSubjectType subjectType,
    Long subjectId,
    Long dailyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status
) {
    public QuotaPolicySpec spec() {
        return new QuotaPolicySpec(
            name, subjectType, subjectId, dailyTokenLimit, monthlyTokenLimit, rpm, concurrency, status
        );
    }
}
