/**
 * [INPUT]: 依赖可信代理处理后的 HttpServletRequest、ServletUtils、EnterpriseRequestIds 与 SHA-256。
 * [OUTPUT]: 对外提供 requestId/sourceIp/userAgentHash 的统一脱敏投影。
 * [POS]: common/api 的 HTTP 关联元数据边界，避免各纵向 Controller 重复处理或传递原始 user-agent。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.common.core.utils.ServletUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public record EnterpriseRequestMetadata(String requestId, String sourceIp, byte[] userAgentHash) {
    public EnterpriseRequestMetadata {
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    public static EnterpriseRequestMetadata from(HttpServletRequest request) {
        return new EnterpriseRequestMetadata(
            EnterpriseRequestIds.current(request),
            ServletUtils.getClientIP(request),
            hash(request.getHeader("User-Agent"))
        );
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }

    private static byte[] hash(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return null;
        try {
            return MessageDigest.getInstance("SHA-256").digest(userAgent.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }
}
