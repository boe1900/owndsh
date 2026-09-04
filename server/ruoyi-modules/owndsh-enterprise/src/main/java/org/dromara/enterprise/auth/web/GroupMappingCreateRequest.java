/**
 * [INPUT]: 接收身份源 ID、外部组精确值与产品用户组 ID。
 * [OUTPUT]: 对外提供组映射创建请求 DTO，所有 ID 保持字符串跨端表示。
 * [POS]: auth/web 的组映射写协议边界，Application Service 继续拥有存在性和唯一性规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

/**
 * 外部组映射创建请求。
 */
public record GroupMappingCreateRequest(String sourceId, String externalGroup, String accessGroupId) {
    public long parsedSourceId() {
        return positive(sourceId, "sourceId");
    }

    public long parsedAccessGroupId() {
        return positive(accessGroupId, "accessGroupId");
    }

    private static long positive(String value, String name) {
        try {
            long parsed = Long.parseLong(value);
            if (parsed <= 0) throw new NumberFormatException("non-positive");
            return parsed;
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException(name + " 非法", exception);
        }
    }
}
