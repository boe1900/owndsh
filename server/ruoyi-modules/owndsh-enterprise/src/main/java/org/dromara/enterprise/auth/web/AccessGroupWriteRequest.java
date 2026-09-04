/**
 * [INPUT]: 反序列化产品用户组名称与完整手工成员 ID 列表。
 * [OUTPUT]: 对外提供经过字符串 Snowflake ID 解析的用户组写请求。
 * [POS]: auth/web 的用户组请求边界，不允许控制身份源同步成员关系。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import java.util.List;

public record AccessGroupWriteRequest(String name, List<String> memberIds) {
    public List<Long> parsedMemberIds() {
        if (memberIds == null) throw new IllegalArgumentException("memberIds 不能为空");
        return memberIds.stream().map(AccessGroupWriteRequest::parseId).toList();
    }

    private static long parseId(String value) {
        try {
            long id = Long.parseLong(value);
            if (id <= 0) throw new NumberFormatException("non-positive");
            return id;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("memberId 非法", exception);
        }
    }
}
