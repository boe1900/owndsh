/**
 * [INPUT]: 依赖固定管理端 Cookie 约定、Sa-Token 请求存储与 Servlet 过滤链。
 * [OUTPUT]: 在 MVC 权限注解执行前把可信管理端 Cookie 桥接到当前 Sa-Token 请求上下文。
 * [POS]: owndsh-server 的管理端认证前置适配器，仅覆盖 /enterprise/admin/**，不改变 Desktop Bearer 读取。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.web.enterprise;

import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.dromara.enterprise.auth.web.AdminSessionCookie;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.WebUtils;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public final class AdminSessionCookieFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String currentToken = StpUtil.getTokenValue();
        if (currentToken == null || currentToken.isBlank()) {
            Cookie cookie = WebUtils.getCookie(request, AdminSessionCookie.NAME);
            if (cookie != null && AdminSessionCookie.isValidValue(cookie.getValue())) {
                StpUtil.setTokenValueToStorage(cookie.getValue());
            }
        }
        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isEmpty()) path = request.getRequestURI();
        return !path.startsWith("/enterprise/admin/");
    }
}
