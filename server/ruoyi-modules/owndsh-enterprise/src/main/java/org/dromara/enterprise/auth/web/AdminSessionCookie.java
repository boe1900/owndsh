/**
 * [INPUT]: 依赖 Spring ResponseCookie、Servlet 请求与服务端签发的 enterprise-admin opaque Token。
 * [OUTPUT]: 提供安全管理端 Cookie 签发/删除、可信值校验，并拒绝显式跨源的非安全方法请求。
 * [POS]: auth/web 的浏览器会话边界，集中固定 Cookie 属性与最小 CSRF 防护，不改变 Desktop Bearer Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

import java.net.URI;
import java.time.Duration;
import java.util.Objects;
import java.util.Set;

public final class AdminSessionCookie {
    public static final String NAME = "__Host-enterprise-admin";
    private static final int MAX_VALUE_LENGTH = 4096;
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private AdminSessionCookie() {
    }

    public static String issue(String token, long expiresInSeconds) {
        if (expiresInSeconds <= 0) throw new IllegalArgumentException("Cookie 有效期必须为正数");
        return cookie(Objects.requireNonNull(token, "token"))
            .maxAge(Duration.ofSeconds(expiresInSeconds))
            .build()
            .toString();
    }

    public static String clear() {
        return cookie("").maxAge(Duration.ZERO).build().toString();
    }

    public static boolean isValidValue(String value) {
        return value != null && !value.isBlank() && value.length() <= MAX_VALUE_LENGTH;
    }

    public static void requireSameOriginForUnsafe(HttpServletRequest request) {
        if (SAFE_METHODS.contains(request.getMethod())) return;
        String source = request.getHeader(HttpHeaders.ORIGIN);
        if (source == null || source.isBlank()) source = request.getHeader(HttpHeaders.REFERER);
        if (source == null || source.isBlank()) return;
        try {
            URI uri = URI.create(source);
            if (uri.getUserInfo() != null
                || !request.getScheme().equalsIgnoreCase(uri.getScheme())
                || !request.getServerName().equalsIgnoreCase(uri.getHost())
                || effectivePort(request.getScheme(), request.getServerPort())
                    != effectivePort(uri.getScheme(), uri.getPort())) {
                throw new AuthFlowException("ENT_AUTH_REQUIRED");
            }
        } catch (IllegalArgumentException exception) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
    }

    private static ResponseCookie.ResponseCookieBuilder cookie(String value) {
        return ResponseCookie.from(NAME, value)
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .path("/");
    }

    private static int effectivePort(String scheme, int port) {
        if (port > 0) return port;
        return "https".equalsIgnoreCase(scheme) ? 443 : 80;
    }
}
