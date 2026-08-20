/**
 * [INPUT]: 依赖 PlusWebInvokeTimeInterceptor、Spring mock Servlet 与 Logback 内存 appender
 * [OUTPUT]: 验证企业正文整段省略及非企业认证参数按大小写/分隔符删除
 * [POS]: common-web 请求日志的敏感信息回归门禁，防止性能日志绕过领域审计白名单
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.common.web.interceptor;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class PlusWebInvokeTimeInterceptorTest {
    @Test
    void omitsAllEnterpriseRequestParameters() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/enterprise/gateway/v1/chat/completions");
        request.setContentType("application/json");
        request.setContent("""
            {"credential":"controlled-provider-value","messages":[{"content":"controlled-prompt"}]}
            """.getBytes());

        List<String> messages = capture(request);

        assertThat(messages).anyMatch(message -> message.contains("参数已省略"));
        assertThat(messages).noneMatch(message -> message.contains("controlled-provider-value"));
        assertThat(messages).noneMatch(message -> message.contains("controlled-prompt"));
    }

    @Test
    void removesAuthenticationAndTokenParametersCaseInsensitively() {
        Map<String, String[]> sanitized = PlusWebInvokeTimeInterceptor.sanitizeParameters(Map.of(
            "Authorization", new String[]{"Bearer controlled-token"},
            "access_token", new String[]{"controlled-access-token"},
            "clientid", new String[]{"enterprise-admin"}
        ));

        assertThat(sanitized).containsOnlyKeys("clientid");
    }

    private static List<String> capture(MockHttpServletRequest request) throws Exception {
        Logger logger = (Logger) LoggerFactory.getLogger(PlusWebInvokeTimeInterceptor.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            PlusWebInvokeTimeInterceptor interceptor = new PlusWebInvokeTimeInterceptor();
            interceptor.preHandle(request, new MockHttpServletResponse(), new Object());
            interceptor.afterCompletion(request, new MockHttpServletResponse(), new Object(), null);
            return appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
