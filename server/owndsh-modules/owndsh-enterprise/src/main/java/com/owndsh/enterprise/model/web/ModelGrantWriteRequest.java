/**
 * [INPUT]: 接收 MODEL_SET/MODEL 资源、ALL_MEMBERS/ACCESS_GROUP/MEMBER 主体集合与授权状态。
 * [OUTPUT]: 对外提供多主体授权写 DTO 及 application spec 转换。
 * [POS]: model/web 的授权写入边界，主体存在性和重复约束由 application/数据库裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ModelGrantSpec;
import com.owndsh.enterprise.model.domain.GrantResourceType;
import com.owndsh.enterprise.model.domain.GrantSubjectType;
import com.owndsh.enterprise.model.domain.ModelStatus;

import java.util.List;

public record ModelGrantWriteRequest(
    GrantResourceType resourceType,
    long resourceId,
    GrantSubjectType subjectType,
    List<Long> subjectIds,
    ModelStatus status
) {
    public ModelGrantSpec spec() {
        return new ModelGrantSpec(resourceType, resourceId, subjectType, subjectIds, status);
    }
}
