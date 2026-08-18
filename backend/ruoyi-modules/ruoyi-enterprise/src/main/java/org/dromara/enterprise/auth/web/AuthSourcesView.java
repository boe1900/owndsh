/**
 * [INPUT]: 依赖 AuthSources application 结果。
 * [OUTPUT]: 对外提供字符串 snowflake ID 的公开身份源与 transaction-bound CSRF 响应 DTO。
 * [POS]: auth/web 的 sources 协议投影，不允许身份源配置或秘密字段越界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import org.dromara.enterprise.auth.application.AuthSources;
import org.dromara.enterprise.auth.domain.IdentitySourceType;

import java.util.List;

public record AuthSourcesView(String transactionId, String csrfToken, List<Source> sources) {
    public static AuthSourcesView from(AuthSources value) {
        return new AuthSourcesView(
            value.transactionId(),
            value.csrfToken(),
            value.sources().stream()
                .map(source -> new Source(Long.toString(source.id()), source.name(), source.type()))
                .toList()
        );
    }

    public record Source(String id, String name, IdentitySourceType type) {
    }
}
