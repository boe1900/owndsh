/**
 * [INPUT]: 接收管理协议的名称、主体、nullable 独立限额与状态。
 * [OUTPUT]: 对外提供经过 ORGANIZATION/MEMBER 约束校验的 quota policy command。
 * [POS]: quota/application 的写入值对象，null 明确表示该策略不施加对应上限。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;

import java.util.Objects;

public record QuotaPolicySpec(
    String name,
    QuotaSubjectType subjectType,
    Long subjectId,
    Long dailyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status
) {
    public QuotaPolicySpec {
        Objects.requireNonNull(name, "name");
        name = name.trim();
        if (name.isEmpty() || name.length() > 120) throw new IllegalArgumentException("name 长度非法");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(status, "status");
        if ((subjectType == QuotaSubjectType.ORGANIZATION) != (subjectId == null)
            || subjectId != null && subjectId <= 0) {
            throw new IllegalArgumentException("ORGANIZATION 必须省略 subjectId，MEMBER 必须提供正数 subjectId");
        }
        requirePositive(dailyTokenLimit, "dailyTokenLimit");
        requirePositive(monthlyTokenLimit, "monthlyTokenLimit");
        requirePositive(rpm, "rpm");
        requirePositive(concurrency, "concurrency");
        if (dailyTokenLimit == null && monthlyTokenLimit == null && rpm == null && concurrency == null) {
            throw new IllegalArgumentException("至少配置一个配额上限");
        }
    }

    private static void requirePositive(Number value, String name) {
        if (value != null && value.longValue() <= 0) throw new IllegalArgumentException(name + " 必须为正数");
    }
}
