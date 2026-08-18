/**
 * [INPUT]: 接收身份适配器完成校验后的稳定 subject、展示属性与外部组。
 * [OUTPUT]: 对外提供不含密码、access token、refresh token 或原始 claims 的统一 IdentityPrincipal。
 * [POS]: auth 适配器到账号绑定服务的唯一成功结果，隔离外部协议与平台业务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.List;
import java.util.Objects;

/**
 * 已完成外部校验的统一身份。
 */
public record IdentityPrincipal(
    String sourceId,
    IdentitySourceType sourceType,
    String externalSubject,
    String username,
    String displayName,
    String email,
    List<String> externalGroups
) {
    public IdentityPrincipal {
        requireText(sourceId, "sourceId");
        Objects.requireNonNull(sourceType, "sourceType");
        requireText(externalSubject, "externalSubject");
        requireText(username, "username");
        requireText(displayName, "displayName");
        externalGroups = List.copyOf(Objects.requireNonNull(externalGroups, "externalGroups"));
        if (externalGroups.stream().anyMatch(group -> group == null || group.isBlank())) {
            throw new IllegalArgumentException("externalGroups 不能包含空值");
        }
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
    }
}
