/**
 * [INPUT]: 由登录编排在初始认证成功或候选新密码被拒绝后携带轮换的 challenge token。
 * [OUTPUT]: 向认证 Controller 提供无原始凭据的 CHANGE_PASSWORD 页面步骤与拒绝事实。
 * [POS]: auth/application 的受限认证控制异常，只用于仍有效的同一登录事务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import java.util.Objects;

public final class PasswordChangeRequiredException extends RuntimeException {
    private final String challengeToken;
    private final boolean rejected;

    public PasswordChangeRequiredException(String challengeToken, boolean rejected) {
        super("必须修改初始密码", null, false, false);
        this.challengeToken = Objects.requireNonNull(challengeToken, "challengeToken");
        this.rejected = rejected;
    }

    public String challengeToken() {
        return challengeToken;
    }

    public boolean rejected() {
        return rejected;
    }
}
