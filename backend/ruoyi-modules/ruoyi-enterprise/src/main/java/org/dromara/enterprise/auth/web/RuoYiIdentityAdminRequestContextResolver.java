/**
 * [INPUT]: 依赖固定 tenant 配置、LoginHelper、ServletUtils、EnterpriseRequestIds 与 SHA-256。
 * [OUTPUT]: 对外提供不信任客户端 tenant/actor 的管理员请求上下文实现。
 * [POS]: auth/web 到 RuoYi 会话/Servlet 基础设施的 adapter，原始 user-agent 只转换为 hash。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.common.core.utils.ServletUtils;
import org.dromara.common.satoken.utils.LoginHelper;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;

/**
 * RuoYi 管理员请求上下文解析器。
 */
@Component
public final class RuoYiIdentityAdminRequestContextResolver implements IdentityAdminRequestContextResolver {
    private final String tenantId;

    public RuoYiIdentityAdminRequestContextResolver(EnterpriseIdentityProperties properties) {
        this.tenantId = Objects.requireNonNull(properties.getTenantId(), "enterprise.tenant-id");
        if (tenantId.isBlank()) throw new IllegalArgumentException("enterprise.tenant-id 不能为空");
    }

    @Override
    public EnterpriseRequestContext resolve(HttpServletRequest request) {
        StpUtil.checkLogin();
        Long actorId = LoginHelper.getUserId();
        if (actorId == null) throw new IllegalStateException("当前登录会话缺少 userId");
        return new EnterpriseRequestContext(
            tenantId,
            actorId,
            EnterpriseRequestIds.current(request),
            ServletUtils.getClientIP(request),
            hash(request.getHeader("User-Agent"))
        );
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
