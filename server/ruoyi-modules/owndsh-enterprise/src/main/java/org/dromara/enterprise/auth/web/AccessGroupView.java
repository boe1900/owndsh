/**
 * [INPUT]: 投影 AccessGroup 的名称、手工成员 ID、有效成员数与 revision。
 * [OUTPUT]: 对外提供 Snowflake 字符串 ID 的产品用户组管理响应。
 * [POS]: auth/web 的用户组输出边界，身份源来源关系只折叠进有效成员数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import org.dromara.enterprise.auth.domain.AccessGroup;

import java.util.List;

public record AccessGroupView(
    String id,
    String name,
    List<String> manualMemberIds,
    int memberCount,
    long revision
) {
    public static AccessGroupView from(AccessGroup value) {
        return new AccessGroupView(
            Long.toString(value.id()), value.name(), value.manualMemberIds().stream().map(String::valueOf).toList(),
            value.memberCount(), value.revision()
        );
    }
}
