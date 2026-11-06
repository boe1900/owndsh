/**
 * [INPUT]: 投影 ModelGrant 的资源类型/名称、主体集合、状态、revision 与时间。
 * [OUTPUT]: 对外提供携带 subjects 数组的模型授权管理响应 DTO。
 * [POS]: model/web 的授权输出边界，展示名来自服务端 join 且不参与 runtime 授权裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.domain.GrantResourceType;
import com.owndsh.enterprise.model.domain.GrantSubjectType;
import com.owndsh.enterprise.model.domain.ModelGrant;
import com.owndsh.enterprise.model.domain.ModelStatus;
import java.time.Instant;
import java.util.List;

public record ModelGrantView(
    String id,
    GrantResourceType resourceType,
    String resourceId,
    String resourceName,
    GrantSubjectType subjectType,
    List<SubjectView> subjects,
    ModelStatus status,
    long revision,
    Instant createdAt,
    Instant updatedAt
) {
    public static ModelGrantView from(ModelGrant grant) {
        return new ModelGrantView(
            Long.toString(grant.id()), grant.resourceType(), Long.toString(grant.resourceId()), grant.resourceName(),
            grant.subjectType(),
            grant.subjects().stream().map(subject -> new SubjectView(
                Long.toString(subject.subjectId()), subject.subjectName()
            )).toList(),
            grant.status(), grant.revision(), grant.createdAt(), grant.updatedAt()
        );
    }

    public record SubjectView(String subjectId, String subjectName) {
    }
}
