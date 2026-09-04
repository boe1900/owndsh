/**
 * [INPUT]: 接收身份适配器脱敏后的连接检查结论。
 * [OUTPUT]: 对外提供仅含类型、成功标志和固定诊断码的 IdentitySourceConnection。
 * [POS]: 身份源 test API 的安全结果，禁止携带 endpoint 响应、DN、Token 或秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import org.dromara.enterprise.auth.domain.IdentitySourceType;

import java.util.Objects;

/**
 * 身份源连接检查结果。
 */
public record IdentitySourceConnection(IdentitySourceType type, boolean ok, String diagnostic) {
    public IdentitySourceConnection {
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(diagnostic, "diagnostic");
        if (diagnostic.isBlank() || diagnostic.length() > 64) {
            throw new IllegalArgumentException("diagnostic 非法");
        }
    }

    public static IdentitySourceConnection ready(IdentitySourceType type) {
        return new IdentitySourceConnection(type, true, "READY");
    }
}
