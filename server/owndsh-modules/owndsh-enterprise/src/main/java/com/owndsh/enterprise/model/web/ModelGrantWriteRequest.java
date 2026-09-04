/**
 * [INPUT]: 接收 MODEL_SET/MODEL resource、ALL_MEMBERS/ACCESS_GROUP/MEMBER subject 与状态字段。
 * [OUTPUT]: 对外提供 ModelGrantSpec 转换。
 * [POS]: model/web 的单条/批量授权共享 DTO，subjectName 永远由服务端 Host 事实解析。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ModelGrantSpec;
import com.owndsh.enterprise.model.domain.GrantResourceType;
import com.owndsh.enterprise.model.domain.GrantSubjectType;
import com.owndsh.enterprise.model.domain.ModelStatus;

public record ModelGrantWriteRequest(
    GrantResourceType resourceType,
    long resourceId,
    GrantSubjectType subjectType,
    Long subjectId,
    ModelStatus status
) {
    public ModelGrantSpec spec() {
        return new ModelGrantSpec(resourceType, resourceId, subjectType, subjectId, status);
    }
}
