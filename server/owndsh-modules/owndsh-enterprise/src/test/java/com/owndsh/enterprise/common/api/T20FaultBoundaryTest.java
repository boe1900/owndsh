/**
 * [INPUT]: 依赖 EnterpriseExceptionHandler、mock request 与含受控秘密的数据库/Redis 故障。
 * [OUTPUT]: 验证不可达服务统一返回 retryable 503，日志不记录异常 message/stack。
 * [POS]: common/api 的 T20 fail-closed 与秘密隔离门禁，真实进程 kill 由恢复演练脚本承担。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class T20FaultBoundaryTest {
    private static final String CONTROLLED_SECRET = "t20-controlled-service-password";

    @Test
    void mapsDatabaseAndRedisOutagesWithoutLoggingTheirMessages() {
        Logger logger = (Logger) LoggerFactory.getLogger(EnterpriseExceptionHandler.class);
        ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertUnavailable(new DatabaseUnavailable(CONTROLLED_SECRET));
            assertUnavailable(new RedisUnavailable(CONTROLLED_SECRET));

            String logs = appender.list.stream()
                .map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                .reduce("", (left, right) -> left + "\n" + right);
            assertThat(logs)
                .contains("DatabaseUnavailable", "RedisUnavailable", "requestId=req_")
                .doesNotContain(CONTROLLED_SECRET);
            assertThat(appender.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    private static void assertUnavailable(RuntimeException failure) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/enterprise/api/v1/test");
        var response = new EnterpriseExceptionHandler().unexpected(failure, request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().error()).satisfies(error -> {
            assertThat(error.code()).isEqualTo("ENT_PLATFORM_UNAVAILABLE");
            assertThat(error.retryable()).isTrue();
            assertThat(error.details()).isNull();
            assertThat(error.message()).doesNotContain(CONTROLLED_SECRET);
        });
    }

    private static final class DatabaseUnavailable extends RuntimeException {
        private DatabaseUnavailable(String message) {
            super(message);
        }
    }

    private static final class RedisUnavailable extends RuntimeException {
        private RedisUnavailable(String message) {
            super(message);
        }
    }
}
