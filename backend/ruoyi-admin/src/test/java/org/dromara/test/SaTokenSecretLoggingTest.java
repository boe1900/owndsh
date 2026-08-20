/**
 * [INPUT]: 依赖 SaTokenExceptionHandler、携带受控 JWT 的真实 NotLoginException 与 Logback appender。
 * [OUTPUT]: 验证认证/权限失败响应和日志均不回显异常 message 或 Token。
 * [POS]: ruoyi-admin 的 T20 平台 Token 日志回归，直接执行全局 Sa-Token advice。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.test;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import org.dromara.common.satoken.handler.SaTokenExceptionHandler;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class SaTokenSecretLoggingTest {
    private static final String TOKEN = "eyJ0MjAiOiJjb250cm9sbGVkIn0.eyJzdWIiOiJ0ZXN0In0.signature123";

    @Test
    void omitsRawTokenAndExceptionMessagesFromAuthenticationLogs() {
        Logger logger = (Logger) LoggerFactory.getLogger(SaTokenExceptionHandler.class);
        ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            SaTokenExceptionHandler handler = new SaTokenExceptionHandler();
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/system/user/getInfo");
            var notLogin = NotLoginException.newInstance(
                "login", NotLoginException.NOT_TOKEN, "客户端ID与Token不匹配: " + TOKEN, TOKEN
            );
            assertThat(handler.handleNotLoginException(notLogin, request).getMsg()).doesNotContain(TOKEN);
            assertThat(handler.handleNotAccessException(
                new NotPermissionException("受控权限异常: " + TOKEN), request
            ).getMsg()).doesNotContain(TOKEN);

            String logs = appender.list.stream()
                .map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                .reduce("", (left, right) -> left + "\n" + right);
            assertThat(logs)
                .contains("认证失败 type=", "权限码校验失败")
                .doesNotContain(TOKEN, "客户端ID与Token不匹配", "受控权限异常");
            assertThat(appender.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
