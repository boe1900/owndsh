/**
 * [INPUT]: 聚合模型/模型集资源、全员/用户组/成员主体集合、状态、revision 与时间。
 * [OUTPUT]: 对外提供带创建/更新时间与主体集合的 ModelGrant 领域记录及 ModelGrantSubject 条目复用。
 * [POS]: model/domain 的显式授权事实，策略 = 资源 × 主体类型，主体名称是可信 join 投影而非授权依据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record ModelGrant(
    long id,
    String tenantId,
    GrantResourceType resourceType,
    long resourceId,
    String resourceName,
    GrantSubjectType subjectType,
    List<ModelGrantSubject> subjects,
    ModelStatus status,
    long revision,
    Instant createdAt,
    Instant updatedAt
) {
    public ModelGrant {
        if (id <= 0 || resourceId <= 0) {
            throw new IllegalArgumentException("grant id 必须为正数");
        }
        tenantId = requireText(tenantId, "tenantId", 20);
        Objects.requireNonNull(resourceType, "resourceType");
        resourceName = requireText(resourceName, "resourceName", 120);
        Objects.requireNonNull(subjectType, "subjectType");
        // 读路径不设主体数量上限：存量迁移可能合并出任意规模的合法策略，写入上限由 ModelGrantSpec 裁决
        subjects = List.copyOf(Objects.requireNonNull(subjects, "subjects"));
        if ((subjectType == GrantSubjectType.ALL_MEMBERS) != subjects.isEmpty()) {
            throw new IllegalArgumentException("ALL_MEMBERS 必须为空主体集合，ACCESS_GROUP/MEMBER 必须至少一个主体");
        }
        Objects.requireNonNull(status, "status");
        if (revision < 0 || createdAt == null || updatedAt == null) throw new IllegalArgumentException("grant 时间或 revision 非法");
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
}
