/**
 * [INPUT]: 接收 MODEL_SET/MODEL 资源、ALL_MEMBERS/ACCESS_GROUP/MEMBER 主体集合与授权状态。
 * [OUTPUT]: 对外提供携带主体集合的授权写 command。
 * [POS]: model/application 的授权配置边界，主体存在性和重复约束由事务服务裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.GrantSubjectType;
import com.owndsh.enterprise.model.domain.GrantResourceType;
import com.owndsh.enterprise.model.domain.ModelStatus;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

public record ModelGrantSpec(
    GrantResourceType resourceType,
    long resourceId,
    GrantSubjectType subjectType,
    List<Long> subjectIds,
    ModelStatus status
) {
    /** 写路径主体上限：防无界 payload，由 Service 在 create/update 中裁决（存量超限策略允许原样/缩减保存）。 */
    public static final int MAX_SUBJECTS = 1000;

    public ModelGrantSpec {
        Objects.requireNonNull(resourceType, "resourceType");
        if (resourceId <= 0) throw new IllegalArgumentException("resource id 必须为正数");
        Objects.requireNonNull(subjectType, "subjectType");
        subjectIds = normalize(subjectType, subjectIds);
        Objects.requireNonNull(status, "status");
    }

    /** 主体集合规范化：null 视为空，去重保序并逐个校验正数与 ALL_MEMBERS 互斥边界；数量上限不在形状层裁决。 */
    private static List<Long> normalize(GrantSubjectType subjectType, List<Long> subjectIds) {
        List<Long> raw = subjectIds == null ? List.of() : subjectIds;
        List<Long> distinct = new ArrayList<>(new LinkedHashSet<>(raw));
        for (Long subjectId : distinct) {
            if (subjectId == null || subjectId <= 0) {
                throw new IllegalArgumentException("subjectId 必须为正数");
            }
        }
        if ((subjectType == GrantSubjectType.ALL_MEMBERS) != distinct.isEmpty()) {
            throw new IllegalArgumentException("ALL_MEMBERS 必须省略 subjectIds，ACCESS_GROUP/MEMBER 必须至少提供正数 subjectId");
        }
        return List.copyOf(distinct);
    }
}
