/**
 * [INPUT]: 接收已持久化的外部组、身份源、RuoYi 部门与 optimistic revision。
 * [OUTPUT]: 对外提供不可变 ExternalGroupMapping 聚合。
 * [POS]: auth 领域中 external_group 到 sys_dept 的显式映射事实，不承载外部用户成员列表。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.Objects;

/**
 * 外部组到部门映射。
 */
public record ExternalGroupMapping(
    long id,
    String tenantId,
    long sourceId,
    String externalGroup,
    long departmentId,
    long revision
) {
    public ExternalGroupMapping {
        if (id <= 0 || sourceId <= 0 || departmentId <= 0) {
            throw new IllegalArgumentException("映射 ID 必须为正数");
        }
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(externalGroup, "externalGroup");
        if (tenantId.isBlank() || externalGroup.isBlank() || externalGroup.length() > 512) {
            throw new IllegalArgumentException("组映射字段非法");
        }
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }
}
