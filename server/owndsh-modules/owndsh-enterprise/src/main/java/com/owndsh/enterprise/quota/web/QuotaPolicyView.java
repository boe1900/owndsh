/**
 * [INPUT]: 投影带 TOKEN/RATE 判别的 QuotaPolicy 聚合及主体集合。
 * [OUTPUT]: 对外提供 OpenAPI QuotaPolicy 的类型、字符串 ID、nullable limits 和 revision。
 * [POS]: quota/web 的策略管理输出边界，以类型阻止控制台混淆累计量与瞬时流量。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.web;

import com.owndsh.enterprise.quota.domain.QuotaPolicy;
import com.owndsh.enterprise.quota.domain.QuotaPolicyType;
import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaResourceType;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;

public record QuotaPolicyView(
    String id,
    String name,
    QuotaPolicyType policyType,
    QuotaSubjectType subjectType,
    java.util.List<SubjectView> subjects,
    QuotaResourceType resourceType,
    String resourceId,
    String resourceName,
    Long fiveHourTokenLimit,
    Long dailyTokenLimit,
    Long weeklyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status,
    long revision
) {
    public static QuotaPolicyView from(QuotaPolicy value) {
        return new QuotaPolicyView(
            Long.toString(value.id()), value.name(), value.policyType(), value.subjectType(),
            value.subjects().stream().map(subject -> new SubjectView(
                Long.toString(subject.subjectId()), subject.subjectName())).toList(),
            value.resourceType(), value.resourceId() == null ? null : Long.toString(value.resourceId()),
            value.resourceName(), value.fiveHourTokenLimit(), value.dailyTokenLimit(), value.weeklyTokenLimit(),
            value.monthlyTokenLimit(), value.rpm(), value.concurrency(), value.status(), value.revision()
        );
    }

    public record SubjectView(String subjectId, String subjectName) {
    }
}
