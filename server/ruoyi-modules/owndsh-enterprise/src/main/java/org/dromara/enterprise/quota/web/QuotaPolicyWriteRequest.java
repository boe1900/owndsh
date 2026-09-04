/**
 * [INPUT]: 反序列化 quota policy 类型及显式 nullable 限额字段。
 * [OUTPUT]: 对外提供到 TOKEN/RATE 互斥 QuotaPolicySpec 的唯一转换。
 * [POS]: quota/web 的请求边界，拒绝跨类型混填并保留 null 的“不施加上限”语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import org.dromara.enterprise.quota.application.QuotaPolicySpec;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaPolicyType;
import org.dromara.enterprise.quota.domain.QuotaResourceType;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;

public record QuotaPolicyWriteRequest(
    String name,
    QuotaPolicyType policyType,
    QuotaSubjectType subjectType,
    Long subjectId,
    QuotaResourceType resourceType,
    Long resourceId,
    Long fiveHourTokenLimit,
    Long dailyTokenLimit,
    Long weeklyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status
) {
    public QuotaPolicySpec spec() {
        return new QuotaPolicySpec(
            name, policyType, subjectType, subjectId, resourceType, resourceId, fiveHourTokenLimit, dailyTokenLimit,
            weeklyTokenLimit, monthlyTokenLimit, rpm, concurrency, status
        );
    }
}
