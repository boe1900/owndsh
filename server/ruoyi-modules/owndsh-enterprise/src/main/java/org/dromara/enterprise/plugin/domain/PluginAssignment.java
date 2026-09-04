/**
 * [INPUT]: 聚合 package/version、ALL/DEPT/USER 主体、INSTALLED/ABSENT 期望态与 required 标志。
 * [OUTPUT]: 对外提供主体 nullability、ABSENT 非 required 和 revision 不变量的 assignment。
 * [POS]: plugin/domain 的中心期望事实，优先级由 EffectivePluginResolver 唯一裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.domain;

import java.util.Objects;

public record PluginAssignment(
    long id,
    String tenantId,
    long packageId,
    long pluginVersionId,
    SubjectType subjectType,
    Long subjectId,
    DesiredState desiredState,
    boolean required,
    Status status,
    long revision
) {
    public PluginAssignment {
        if (id <= 0 || packageId <= 0 || pluginVersionId <= 0) {
            throw new IllegalArgumentException("assignment ID 必须为正数");
        }
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(subjectType, "subjectType");
        Objects.requireNonNull(desiredState, "desiredState");
        Objects.requireNonNull(status, "status");
        if ((subjectType == SubjectType.ALL && subjectId != null)
            || (subjectType != SubjectType.ALL && (subjectId == null || subjectId <= 0))) {
            throw new IllegalArgumentException("assignment subject 非法");
        }
        if (desiredState == DesiredState.ABSENT && required) {
            throw new IllegalArgumentException("ABSENT assignment 不能 required");
        }
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public enum SubjectType { ALL, DEPT, USER }
    public enum DesiredState { INSTALLED, ABSENT }
    public enum Status { ACTIVE, DISABLED }
}
