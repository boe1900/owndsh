/**
 * [INPUT]: 聚合 tenant 下产品用户组名称、手工成员 ID、有效成员数与 optimistic revision。
 * [OUTPUT]: 对外提供经过基本不变量校验的扁平 AccessGroup。
 * [POS]: auth/domain 的批量模型授权主体，不承载角色、部门层级或共享 Token 池。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.List;
import java.util.Objects;

public record AccessGroup(
    long id,
    String tenantId,
    String name,
    List<Long> manualMemberIds,
    int memberCount,
    long revision
) {
    public AccessGroup {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        name = requireText(name, "name", 120);
        manualMemberIds = List.copyOf(Objects.requireNonNull(manualMemberIds, "manualMemberIds"));
        if (manualMemberIds.size() > 200 || manualMemberIds.stream().anyMatch(value -> value == null || value <= 0)
            || manualMemberIds.stream().distinct().count() != manualMemberIds.size()) {
            throw new IllegalArgumentException("manualMemberIds 非法");
        }
        if (memberCount < manualMemberIds.size() || revision < 0) {
            throw new IllegalArgumentException("成员数或 revision 非法");
        }
    }

    private static String requireText(String value, String field, int maximum) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > maximum) {
            throw new IllegalArgumentException(field + " 非法");
        }
        return normalized;
    }
}
