/**
 * [INPUT]: 依赖 EnterpriseJsonBodyLimitFilter、Spring mock Servlet 与不可信 JSON bytes。
 * [OUTPUT]: 验证精确上限放行、Content-Length/chunked 超限 413 与 gateway 专用边界。
 * [POS]: common/api 的传输内存边界门禁，证明 MVC 解序列化前已有界读取。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class EnterpriseJsonBodyLimitFilterTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void replaysJsonAtTheExactLimitToMvc() throws Exception {
        EnterpriseJsonBodyLimitFilter filter = filter(8);
        MockHttpServletRequest request = jsonRequest("/enterprise/api/v1/devices/heartbeat", "12345678");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> consumed = new AtomicReference<>();

        filter.doFilter(request, response, (bounded, servletResponse) -> consumed.set(
            new String(bounded.getInputStream().readAllBytes(), StandardCharsets.UTF_8)
        ));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(consumed).hasValue("12345678");
    }

    @Test
    void rejectsDeclaredAndChunkedOversizeWithStableEnvelope() throws Exception {
        EnterpriseJsonBodyLimitFilter filter = filter(8);
        MockHttpServletRequest declared = jsonRequest("/enterprise/api/v1/sessions/s/batches", "123456789");
        assertTooLarge(filter, declared);

        MockHttpServletRequest source = jsonRequest("/enterprise/api/v1/sessions/s/batches", "123456789");
        HttpServletRequest chunked = new HttpServletRequestWrapper(source) {
            @Override
            public int getContentLength() {
                return -1;
            }

            @Override
            public long getContentLengthLong() {
                return -1;
            }
        };
        assertTooLarge(filter, chunked);
    }

    @Test
    void leavesGatewayStreamingLimitToItsDedicatedController() throws Exception {
        EnterpriseJsonBodyLimitFilter filter = filter(2);
        for (String path : new String[] {
            "/enterprise/gateway/v1/chat/completions",
            "/enterprise/gateway/v1/responses",
            "/enterprise/gateway/v1/messages"
        }) {
            MockHttpServletRequest request = jsonRequest(path, "larger-than-generic-limit");
            AtomicReference<Boolean> invoked = new AtomicReference<>(false);
            filter.doFilter(request, new MockHttpServletResponse(), (bounded, response) -> invoked.set(true));
            assertThat(invoked).as(path).hasValue(true);
        }
    }

    private static EnterpriseJsonBodyLimitFilter filter(int maximum) {
        EnterpriseHttpProperties properties = new EnterpriseHttpProperties();
        properties.setMaxJsonRequestBytes(maximum);
        return new EnterpriseJsonBodyLimitFilter(JSON, properties);
    }

    private static MockHttpServletRequest jsonRequest(String path, String body) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        return request;
    }

    private static void assertTooLarge(EnterpriseJsonBodyLimitFilter filter, HttpServletRequest request)
        throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<Boolean> invoked = new AtomicReference<>(false);
        filter.doFilter(request, response, (bounded, servletResponse) -> invoked.set(true));
        assertThat(invoked).hasValue(false);
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeader(EnterpriseRequestIds.HEADER)).startsWith("req_");
        assertThat(response.getContentAsString())
            .contains("\"code\":\"ENT_REQUEST_TOO_LARGE\"")
            .doesNotContain("123456789");
    }
}
