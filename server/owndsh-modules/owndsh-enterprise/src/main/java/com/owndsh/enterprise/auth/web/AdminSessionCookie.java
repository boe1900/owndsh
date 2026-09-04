/**
 * [INPUT]: 依赖 Spring ResponseCookie、Servlet 请求与服务端签发的 enterprise-admin opaque Token。
 * [OUTPUT]: 提供随外部 HTTP(S) 地址选择名称/Secure 属性的管理端 Cookie 签发/删除、可信值校验与同源写保护。
 * [POS]: auth/web 的浏览器会话边界，HTTPS 保留 __Host- 强化，HTTP 保持可用且不改变 Desktop Bearer Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.application.AuthFlowException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

import java.net.URI;
import java.time.Duration;
import java.util.Objects;
import java.util.Set;

public final class AdminSessionCookie {
    public static final String SECURE_NAME = "__Host-enterprise-admin";
    public static final String INSECURE_NAME = "enterprise-admin";
    private static final int MAX_VALUE_LENGTH = 4096;
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private AdminSessionCookie() {
    }

    public static String name(URI publicBaseUrl) {
        return secure(publicBaseUrl) ? SECURE_NAME : INSECURE_NAME;
    }

    public static String issue(String token, long expiresInSeconds, URI publicBaseUrl) {
        if (expiresInSeconds <= 0) throw new IllegalArgumentException("Cookie 有效期必须为正数");
        return cookie(Objects.requireNonNull(token, "token"), publicBaseUrl)
            .maxAge(Duration.ofSeconds(expiresInSeconds))
            .build()
            .toString();
    }

    public static String clear(URI publicBaseUrl) {
        return cookie("", publicBaseUrl).maxAge(Duration.ZERO).build().toString();
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

    private static ResponseCookie.ResponseCookieBuilder cookie(String value, URI publicBaseUrl) {
        boolean secure = secure(publicBaseUrl);
        return ResponseCookie.from(name(publicBaseUrl), value)
            .httpOnly(true)
            .secure(secure)
            .sameSite("Strict")
            .path("/");
    }

    private static boolean secure(URI publicBaseUrl) {
        return "https".equalsIgnoreCase(Objects.requireNonNull(publicBaseUrl, "publicBaseUrl").getScheme());
    }

    private static int effectivePort(String scheme, int port) {
        if (port > 0) return port;
        return "https".equalsIgnoreCase(scheme) ? 443 : 80;
    }
}
