/**
 * [INPUT]: 接收管理协议的策略类型、名称、主体集合、资源、nullable 独立限额与状态。
 * [OUTPUT]: 对外提供经过 TOKEN/RATE 字段互斥、主体集合与资源范围约束校验的 quota policy command。
 * [POS]: quota/application 的写入值对象，null 表示该类型策略不施加对应上限；数量上限不在形状层裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaPolicyType;
import com.owndsh.enterprise.quota.domain.QuotaResourceType;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

public record QuotaPolicySpec(
    String name,
    QuotaPolicyType policyType,
    QuotaSubjectType subjectType,
    List<Long> subjectIds,
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
        subjectIds = normalize(subjectType, subjectIds);
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(resourceType, "resourceType");
        if ((resourceType == QuotaResourceType.ALL_MODELS) != (resourceId == null)
            || resourceId != null && resourceId <= 0) {
            throw new IllegalArgumentException("ALL_MODELS 必须省略 resourceId，其他资源必须提供正数 resourceId");
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

    /** 主体集合规范化：null 视为空，去重保序并逐个校验正数与 ALL_MEMBERS 互斥边界；数量上限由 Service 写预算裁决。 */
    private static List<Long> normalize(QuotaSubjectType subjectType, List<Long> subjectIds) {
        List<Long> raw = subjectIds == null ? List.of() : subjectIds;
        List<Long> distinct = new ArrayList<>(new LinkedHashSet<>(raw));
        for (Long subjectId : distinct) {
            if (subjectId == null || subjectId <= 0) {
                throw new IllegalArgumentException("subjectId 必须为正数");
            }
        }
        if ((subjectType == QuotaSubjectType.ALL_MEMBERS) != distinct.isEmpty()) {
            throw new IllegalArgumentException("ALL_MEMBERS 必须省略 subjectIds，ACCESS_GROUP/MEMBER 必须至少提供正数 subjectId");
        }
        return List.copyOf(distinct);
    }

    private static void requirePositive(Number value, String name) {
        if (value != null && value.longValue() <= 0) throw new IllegalArgumentException(name + " 必须为正数");
    }
}
