/**
 * [INPUT]: 接收授权操作、主体类型、默认/状态事实与资源/bootstrap revisions。
 * [OUTPUT]: 对外提供 MODEL_GRANT_CHANGED action 的固定审计 metadata。
 * [POS]: model/application 的授权审计白名单，不记录用户/部门名称或请求批量正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ModelStatus;

import java.util.Objects;

public record ModelGrantChangeMetadata(
    Operation operation,
    GrantSubjectType subjectType,
    boolean defaultGrant,
    ModelStatus status,
    long resourceRevision,
    long bootstrapRevision
) implements AuditMetadata {
    public ModelGrantChangeMetadata {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(status, "status");
        if (resourceRevision < 0 || bootstrapRevision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public enum Operation { CREATE, UPDATE, DELETE }

    @Override
    public AuditAction action() {
        return AuditAction.MODEL_GRANT_CHANGED;
    }
}
