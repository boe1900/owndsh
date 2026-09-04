/**
 * [INPUT]: 由 LOCAL adapter 在旧密码正确且账号仍要求首次改密时抛出。
 * [OUTPUT]: 向认证编排提供已认证 IdentityPrincipal，不携带密码、hash 或验证码。
 * [POS]: auth/adapter 到 application 的 challenge 创建信号，不伪装成普通认证失败。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.adapter;

import com.owndsh.enterprise.auth.domain.IdentityPrincipal;

import java.util.Objects;

public final class LocalPasswordChangeRequiredException extends RuntimeException {
    private final IdentityPrincipal principal;

    public LocalPasswordChangeRequiredException(IdentityPrincipal principal) {
        super("LOCAL 账号必须修改初始密码", null, false, false);
        this.principal = Objects.requireNonNull(principal, "principal");
    }

    public IdentityPrincipal principal() {
        return principal;
    }
}
