/**
 * [INPUT]: 依赖真实 ResourcesConfig/CorsFilter、CorsProperties 与 Spring mock Servlet。
 * [OUTPUT]: 验证默认跨域拒绝、同源放行和显式精确 origin 授权。
 * [POS]: common-web 的浏览器同源安全回归，不用 Controller mock 代替 CORS filter。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.common.web.config;

import org.dromara.common.web.config.properties.CorsProperties;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class ResourcesConfigCorsTest {
    @Test
    void rejectsCrossOriginByDefaultAndStillAllowsSameOriginRequests() throws Exception {
        CorsProperties properties = new CorsProperties();
        var filter = new ResourcesConfig().corsFilter(properties);
        var crossOrigin = preflight("https://untrusted.example");
        var crossResponse = new MockHttpServletResponse();
        AtomicBoolean crossChain = new AtomicBoolean();

        filter.doFilter(crossOrigin, crossResponse, (request, response) -> crossChain.set(true));

        assertThat(properties.getAllowedOriginPatterns()).isEmpty();
        assertThat(properties.getAllowCredentials()).isFalse();
        assertThat(crossResponse.getStatus()).isEqualTo(403);
        assertThat(crossResponse.getHeader("Access-Control-Allow-Origin")).isNull();
        assertThat(crossChain).isFalse();

        var sameOrigin = new MockHttpServletRequest("GET", "/enterprise/admin/v1/models");
        var sameResponse = new MockHttpServletResponse();
        AtomicBoolean sameChain = new AtomicBoolean();
        filter.doFilter(sameOrigin, sameResponse, (request, response) -> sameChain.set(true));
        assertThat(sameChain).isTrue();
    }

    @Test
    void permitsOnlyAnExplicitConfiguredOrigin() throws Exception {
        CorsProperties properties = new CorsProperties();
        properties.setAllowCredentials(true);
        properties.setAllowedOriginPatterns(List.of("https://platform.example"));
        properties.setAllowedMethods(List.of("POST"));
        var filter = new ResourcesConfig().corsFilter(properties);
        var response = new MockHttpServletResponse();

        filter.doFilter(preflight("https://platform.example"), response, (request, servletResponse) -> { });

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader("Access-Control-Allow-Origin")).isEqualTo("https://platform.example");
        assertThat(response.getHeader("Access-Control-Allow-Credentials")).isEqualTo("true");
    }

    private static MockHttpServletRequest preflight(String origin) {
        var request = new MockHttpServletRequest("OPTIONS", "/enterprise/auth/v1/token");
        request.addHeader("Origin", origin);
        request.addHeader("Access-Control-Request-Method", "POST");
        return request;
    }
}
