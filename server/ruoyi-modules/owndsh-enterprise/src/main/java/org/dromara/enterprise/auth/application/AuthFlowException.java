/**
 * [INPUT]: 接收登录编排已分类的固定协议错误码。
 * [OUTPUT]: 对外提供不携带密码、Token、用户名或上游响应的认证流程异常。
 * [POS]: auth application 到统一 HTTP 异常边界的稳定失败契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import java.util.Set;

/**
 * 平台认证流程异常。
 */
public final class AuthFlowException extends RuntimeException {
    private static final Set<String> ALLOWED_CODES = Set.of(
        "ENT_INVALID_REQUEST",
        "ENT_INVALID_REDIRECT_URI",
        "ENT_PKCE_REQUIRED",
        "ENT_AUTH_REQUIRED",
        "ENT_AUTH_CODE_INVALID",
        "ENT_PKCE_INVALID",
        "ENT_AUTH_SESSION_EXPIRED"
    );

    private final String code;

    public AuthFlowException(String code) {
        super("平台认证失败: " + requireCode(code), null, false, false);
        this.code = code;
    }

    public String code() {
        return code;
    }

    private static String requireCode(String code) {
        if (!ALLOWED_CODES.contains(code)) throw new IllegalArgumentException("非法认证错误码");
        return code;
    }
}
