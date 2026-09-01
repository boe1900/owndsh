/**
 * [INPUT]: 依赖 quota subject/status 枚举与 V1 nullable 独立限额约束。
 * [OUTPUT]: 对外提供经过主体、限额和 revision 不变量校验的 QuotaPolicy。
 * [POS]: quota/domain 的受管策略聚合，subjectName 仅是管理读投影。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

import java.util.Objects;

public record QuotaPolicy(
    long id,
    String tenantId,
    String name,
    QuotaSubjectType subjectType,
    Long subjectId,
    String subjectName,
    Long dailyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status,
    long revision
) {
    public QuotaPolicy {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        tenantId = requireText(tenantId, "tenantId");
        name = requireText(name, "name");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(status, "status");
        if ((subjectType == QuotaSubjectType.ORGANIZATION) != (subjectId == null)
            || subjectId != null && subjectId <= 0) {
            throw new IllegalArgumentException("ORGANIZATION/MEMBER 与 subjectId 约束不一致");
        }
        requirePositive(dailyTokenLimit, "dailyTokenLimit");
        requirePositive(monthlyTokenLimit, "monthlyTokenLimit");
        requirePositive(rpm, "rpm");
        requirePositive(concurrency, "concurrency");
        if (dailyTokenLimit == null && monthlyTokenLimit == null && rpm == null && concurrency == null) {
            throw new IllegalArgumentException("至少配置一个配额上限");
        }
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String normalized = value.trim();
        if (normalized.isEmpty()) throw new IllegalArgumentException(name + " 不能为空");
        return normalized;
    }

    private static void requirePositive(Number value, String name) {
        if (value != null && value.longValue() <= 0) throw new IllegalArgumentException(name + " 必须为正数");
    }
}
