/**
 * [INPUT]: 接收 MODEL_SET/MODEL 资源、ALL_MEMBERS/ACCESS_GROUP/MEMBER 主体与授权状态。
 * [OUTPUT]: 对外提供单条/批量授权共享的写 command。
 * [POS]: model/application 的授权配置边界，主体存在性和重复约束由事务服务裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.GrantResourceType;
import org.dromara.enterprise.model.domain.ModelStatus;

import java.util.Objects;

public record ModelGrantSpec(
    GrantResourceType resourceType,
    long resourceId,
    GrantSubjectType subjectType,
    Long subjectId,
    ModelStatus status
) {
    public ModelGrantSpec {
        Objects.requireNonNull(resourceType, "resourceType");
        if (resourceId <= 0) throw new IllegalArgumentException("resource id 必须为正数");
        Objects.requireNonNull(subjectType, "subjectType");
        if ((subjectType == GrantSubjectType.ALL_MEMBERS) != (subjectId == null)
            || subjectId != null && subjectId <= 0) {
            throw new IllegalArgumentException("ALL_MEMBERS 必须省略 subjectId，ACCESS_GROUP/MEMBER 必须提供正数 subjectId");
        }
        Objects.requireNonNull(status, "status");
    }
}
