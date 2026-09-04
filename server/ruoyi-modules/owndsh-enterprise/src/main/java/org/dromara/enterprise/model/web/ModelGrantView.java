/**
 * [INPUT]: 投影 ModelGrant 的资源类型/名称、主体名称、状态与 revision。
 * [OUTPUT]: 对外提供模型授权管理响应 DTO。
 * [POS]: model/web 的授权输出边界，展示名来自服务端 join 且不参与 runtime 授权裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.domain.GrantResourceType;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ModelGrant;
import org.dromara.enterprise.model.domain.ModelStatus;

public record ModelGrantView(
    String id,
    GrantResourceType resourceType,
    String resourceId,
    String resourceName,
    GrantSubjectType subjectType,
    String subjectId,
    String subjectName,
    ModelStatus status,
    long revision
) {
    public static ModelGrantView from(ModelGrant grant) {
        return new ModelGrantView(
            Long.toString(grant.id()), grant.resourceType(), Long.toString(grant.resourceId()), grant.resourceName(),
            grant.subjectType(),
            grant.subjectId() == null ? null : Long.toString(grant.subjectId()),
            grant.subjectName(), grant.status(), grant.revision()
        );
    }
}
