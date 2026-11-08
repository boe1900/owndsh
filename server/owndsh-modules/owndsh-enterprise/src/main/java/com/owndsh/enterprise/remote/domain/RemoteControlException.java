/**
 * [INPUT]: 接收 Remote 控制面固定错误码。
 * [OUTPUT]: 对外提供不泄露跨租户存在性的 Remote 业务拒绝异常。
 * [POS]: remote/domain 到统一 EnterpriseExceptionHandler 的稳定错误边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.domain;

import java.util.Set;

public final class RemoteControlException extends RuntimeException {
    private final String code;

    public RemoteControlException(String code) {
        super("Remote 请求被拒绝", null, false, false);
        if (!code.startsWith("ENT_REMOTE_")
            && !Set.of("ENT_IDEMPOTENCY_CONFLICT", "ENT_DEVICE_REVOKED", "ENT_PERMISSION_DENIED", "ENT_RESOURCE_NOT_FOUND").contains(code)) {
            throw new IllegalArgumentException("非法 Remote 错误码");
        }
        this.code = code;
    }

    public String code() {
        return code;
    }
}
