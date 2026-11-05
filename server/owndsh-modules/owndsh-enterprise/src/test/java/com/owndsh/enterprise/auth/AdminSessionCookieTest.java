/**
 * [INPUT]: 依赖 AdminSessionCookie、ConsoleDevOrigins 与 Mockito Servlet 请求桩。
 * [OUTPUT]: 验证安全方法跳过、同源放行、部署调试 origin 豁免与跨源拒绝的 CSRF 写保护边界。
 * [POS]: auth web 会话 Cookie 边界的纯单元门禁；签发/清理由协议契约测试覆盖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.domain.ConsoleDevOrigins;
import com.owndsh.enterprise.auth.web.AdminSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class AdminSessionCookieTest {
    private static final ConsoleDevOrigins DEV_ORIGINS =
        ConsoleDevOrigins.of(List.of(URI.create("http://127.0.0.1:62209")));

    private static HttpServletRequest request(String method, String origin, String scheme, String host, int port) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getMethod()).thenReturn(method);
        when(request.getHeader(HttpHeaders.ORIGIN)).thenReturn(origin);
        when(request.getScheme()).thenReturn(scheme);
        when(request.getServerName()).thenReturn(host);
        when(request.getServerPort()).thenReturn(port);
        return request;
    }

    @Test
    void skipsSafeMethodsAndMissingOriginHeaders() {
        assertThatCode(() -> AdminSessionCookie.requireSameOriginForUnsafe(
            request("GET", "https://evil.example", "https", "platform.example", 443), DEV_ORIGINS
        )).doesNotThrowAnyException();
        assertThatCode(() -> AdminSessionCookie.requireSameOriginForUnsafe(
            request("POST", null, "https", "platform.example", 443), DEV_ORIGINS
        )).doesNotThrowAnyException();
    }

    @Test
    void acceptsSameOriginAndDeploymentConfiguredDevOriginForUnsafeWrites() {
        assertThatCode(() -> AdminSessionCookie.requireSameOriginForUnsafe(
            request("POST", "https://platform.example", "https", "platform.example", 443), DEV_ORIGINS
        )).doesNotThrowAnyException();
        // 部署声明的 loopback 调试 origin：scheme/host/port 精确一致即视同同源
        assertThatCode(() -> AdminSessionCookie.requireSameOriginForUnsafe(
            request("POST", "http://127.0.0.1:62209", "https", "platform.example", 443), DEV_ORIGINS
        )).doesNotThrowAnyException();
    }

    @Test
    void rejectsForeignOriginsEvenWhenDevOriginsAreConfigured() {
        for (String origin : new String[] {
            "https://evil.example",
            "http://127.0.0.1:62210",
            "http://localhost:62209",
            "http://127.0.0.1:62209.evil.example",
            "http://user@platform.example"
        }) {
            assertThatThrownBy(() -> AdminSessionCookie.requireSameOriginForUnsafe(
                request("POST", origin, "https", "platform.example", 443), DEV_ORIGINS
            )).as(origin).isInstanceOf(AuthFlowException.class);
        }
        // 未配置任何调试 origin 时，唯一合法来源就是部署自身
        assertThatThrownBy(() -> AdminSessionCookie.requireSameOriginForUnsafe(
            request("POST", "http://127.0.0.1:62209", "https", "platform.example", 443), ConsoleDevOrigins.of(null)
        )).isInstanceOf(AuthFlowException.class);
    }
}
