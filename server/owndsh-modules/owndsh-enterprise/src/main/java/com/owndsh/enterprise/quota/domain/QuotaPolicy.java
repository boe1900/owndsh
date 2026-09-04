/**
 * [INPUT]: 依赖 quota type/subject/resource/status 枚举、窗口锚点与 nullable 独立限额约束。
 * [OUTPUT]: 对外提供经过类型互斥、主体、资源、限额和 revision 不变量校验的 QuotaPolicy。
 * [POS]: quota/domain 的受管策略聚合，TOKEN 与 RATE 共享作用域外壳但不共享限制字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

import java.util.Objects;
import java.time.Instant;

public record QuotaPolicy(
    long id,
    String tenantId,
    String name,
    QuotaPolicyType policyType,
    QuotaSubjectType subjectType,
    Long subjectId,
    String subjectName,
    QuotaResourceType resourceType,
    Long resourceId,
    String resourceName,
    Long fiveHourTokenLimit,
    Long dailyTokenLimit,
    Long weeklyTokenLimit,
    Long monthlyTokenLimit,
    Integer rpm,
    Integer concurrency,
    QuotaStatus status,
    Instant windowAnchor,
    long revision
) {
    public QuotaPolicy {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        tenantId = requireText(tenantId, "tenantId");
        name = requireText(name, "name");
        Objects.requireNonNull(policyType, "policyType");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(status, "status");
        if ((subjectType == QuotaSubjectType.ORGANIZATION) != (subjectId == null)
            || subjectId != null && subjectId <= 0) {
            throw new IllegalArgumentException("ORGANIZATION/MEMBER 与 subjectId 约束不一致");
        }
        Objects.requireNonNull(resourceType, "resourceType");
        if ((resourceType == QuotaResourceType.ALL_MODELS) != (resourceId == null)
            || resourceId != null && resourceId <= 0) {
            throw new IllegalArgumentException("ALL_MODELS 与 resourceId 约束不一致");
        }
        if (resourceType == QuotaResourceType.PROVIDER
            && (policyType != QuotaPolicyType.RATE || subjectType != QuotaSubjectType.ORGANIZATION)) {
            throw new IllegalArgumentException("PROVIDER 资源只支持组织级 RATE 策略");
        }
        requirePositive(fiveHourTokenLimit, "fiveHourTokenLimit");
        requirePositive(dailyTokenLimit, "dailyTokenLimit");
        requirePositive(weeklyTokenLimit, "weeklyTokenLimit");
        requirePositive(monthlyTokenLimit, "monthlyTokenLimit");
        requirePositive(rpm, "rpm");
        requirePositive(concurrency, "concurrency");
        boolean hasTokenLimit = fiveHourTokenLimit != null || dailyTokenLimit != null
            || weeklyTokenLimit != null || monthlyTokenLimit != null;
        boolean hasRateLimit = rpm != null || concurrency != null;
        if (policyType == QuotaPolicyType.TOKEN && (!hasTokenLimit || hasRateLimit)) {
            throw new IllegalArgumentException("TOKEN 策略只能配置 Token 窗口");
        }
        if (policyType == QuotaPolicyType.RATE && (!hasRateLimit || hasTokenLimit)) {
            throw new IllegalArgumentException("RATE 策略只能配置 RPM 或并发");
        }
        Objects.requireNonNull(windowAnchor, "windowAnchor");
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
