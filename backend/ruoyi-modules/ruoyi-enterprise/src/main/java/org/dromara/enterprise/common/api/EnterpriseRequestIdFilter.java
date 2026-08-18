/**
 * [INPUT]: 依赖 EnterpriseRequestIds 与 /enterprise/ 请求路径。
 * [OUTPUT]: 为企业 API 预绑定 requestId 并写入 X-Request-Id 响应头。
 * [POS]: common/api 的最外层 HTTP 关联边界，成功与失败响应共享同一请求 ID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 企业 API requestId filter。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public final class EnterpriseRequestIdFilter extends OncePerRequestFilter {
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/enterprise/");
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        response.setHeader(EnterpriseRequestIds.HEADER, EnterpriseRequestIds.current(request));
        filterChain.doFilter(request, response);
    }
}
