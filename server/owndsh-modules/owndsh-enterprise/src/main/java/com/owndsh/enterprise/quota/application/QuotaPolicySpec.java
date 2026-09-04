/**
 * [INPUT]: 接收管理协议的策略类型、名称、主体、资源、nullable 独立限额与状态。
 * [OUTPUT]: 对外提供经过 TOKEN/RATE 字段互斥、主体与资源范围约束校验的 quota policy command。
 * [POS]: quota/application 的写入值对象，null 表示该类型策略不施加对应上限。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaPolicyType;
import com.owndsh.enterprise.quota.domain.QuotaResourceType;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;

import java.util.Objects;

public record QuotaPolicySpec(
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
    public QuotaPolicySpec {
        Objects.requireNonNull(name, "name");
        name = name.trim();
        if (name.isEmpty() || name.length() > 120) throw new IllegalArgumentException("name 长度非法");
        Objects.requireNonNull(policyType, "policyType");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(status, "status");
        if ((subjectType == QuotaSubjectType.ORGANIZATION) != (subjectId == null)
            || subjectId != null && subjectId <= 0) {
            throw new IllegalArgumentException("ORGANIZATION 必须省略 subjectId，MEMBER 必须提供正数 subjectId");
        }
        Objects.requireNonNull(resourceType, "resourceType");
        if ((resourceType == QuotaResourceType.ALL_MODELS) != (resourceId == null)
            || resourceId != null && resourceId <= 0) {
            throw new IllegalArgumentException("ALL_MODELS 必须省略 resourceId，其他资源必须提供正数 resourceId");
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
    }

    private static void requirePositive(Number value, String name) {
        if (value != null && value.longValue() <= 0) throw new IllegalArgumentException(name + " 必须为正数");
    }
}
