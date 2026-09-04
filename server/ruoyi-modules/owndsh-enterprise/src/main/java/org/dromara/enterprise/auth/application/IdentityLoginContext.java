/**
 * [INPUT]: 接收一次适配器成功后的 tenant 与脱敏请求审计上下文。
 * [OUTPUT]: 对外提供不含密码、Token、用户名或 claims 的 IdentityLoginContext。
 * [POS]: T05 登录编排调用 external identity 服务的输入上下文，actor 在绑定后由 userId 确定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import java.util.Objects;

/**
 * 外部身份绑定请求上下文。
 */
public record IdentityLoginContext(
    String tenantId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public IdentityLoginContext {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(requestId, "requestId");
        if (tenantId.isBlank() || requestId.isBlank()) {
            throw new IllegalArgumentException("tenantId/requestId 不能为空");
        }
        if (userAgentHash != null && userAgentHash.length != 32) {
            throw new IllegalArgumentException("userAgentHash 必须是 SHA-256");
        }
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }
}
