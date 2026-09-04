/**
 * [INPUT]: 投影 ExternalGroupMapping 的 source/external-group/access-group/revision 事实。
 * [OUTPUT]: 对外提供字符串 ID 的组映射响应 DTO。
 * [POS]: auth/web 的组映射只读协议，不暴露 tenant 或持久化实现细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import com.owndsh.enterprise.auth.domain.ExternalGroupMapping;

/**
 * 外部组映射管理视图。
 */
public record GroupMappingView(
    String id,
    String sourceId,
    String externalGroup,
    String accessGroupId,
    long revision
) {
    public static GroupMappingView from(ExternalGroupMapping mapping) {
        return new GroupMappingView(
            Long.toString(mapping.id()),
            Long.toString(mapping.sourceId()),
            mapping.externalGroup(),
            Long.toString(mapping.accessGroupId()),
            mapping.revision()
        );
    }
}
