/**
 * [INPUT]: 投影 QuotaPolicy 聚合及只读 subjectName。
 * [OUTPUT]: 对外提供 OpenAPI QuotaPolicy 的字符串 ID、nullable limits 和 revision。
 * [POS]: quota/web 的策略管理输出边界，不暴露 tenant 或内部窗口事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;

public record QuotaPolicyView(
    String id,
    String name,
    QuotaSubjectType subjectType,
    String subjectId,
    String subjectName,
    Long dailyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status,
    long revision
) {
    public static QuotaPolicyView from(QuotaPolicy value) {
        return new QuotaPolicyView(
            Long.toString(value.id()), value.name(), value.subjectType(),
            value.subjectId() == null ? null : Long.toString(value.subjectId()), value.subjectName(),
            value.dailyTokenLimit(), value.monthlyTokenLimit(), value.rpm(), value.concurrency(),
            value.status(), value.revision()
        );
    }
}
