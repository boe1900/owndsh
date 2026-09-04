/**
 * [INPUT]: 接收未过期登录事务与 ACTIVE 身份源公开投影。
 * [OUTPUT]: 对外提供 transaction-bound CSRF 与身份源选择数据。
 * [POS]: auth application 到公开 sources endpoint 的成功结果，不暴露其他登录事务字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import java.util.List;

public record AuthSources(String transactionId, String csrfToken, List<PublicIdentitySource> sources) {
    public AuthSources {
        sources = List.copyOf(sources);
        if (sources.isEmpty()) throw new IllegalArgumentException("至少需要一个可用身份源");
    }
}
