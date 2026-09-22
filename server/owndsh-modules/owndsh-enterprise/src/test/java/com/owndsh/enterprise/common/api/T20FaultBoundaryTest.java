/**
 * [INPUT]: 依赖 EnterpriseExceptionHandler、mock request 与含受控秘密的数据库/Redis 故障。
 * [OUTPUT]: 验证不可达服务统一返回 retryable 503，参数错误展示安全原因且日志不记录异常 message/stack。
 * [POS]: common/api 的 T20 fail-closed 与秘密隔离门禁，真实进程 kill 由恢复演练脚本承担。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import com.owndsh.enterprise.model.application.ManagedModelInUseException;
import com.owndsh.enterprise.model.application.ModelSetInUseException;
import com.owndsh.enterprise.model.persistence.ModelSetDeleteBlockers;
import com.owndsh.enterprise.model.persistence.ManagedModelDeleteBlockers;
import com.owndsh.enterprise.auth.application.AccessGroupInUseException;
import com.owndsh.enterprise.auth.persistence.AccessGroupDeleteBlockers;
import com.owndsh.enterprise.quota.application.QuotaPolicyInUseException;
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

    @Test
    void returnsSafeValidationReasonInsteadOfAPlaceholder() {
        MockHttpServletRequest request = new MockHttpServletRequest("DELETE", "/enterprise/admin/v1/models/1");
        var response = new EnterpriseExceptionHandler().invalidRequest(
            new IllegalArgumentException("仍被授权或用量记录引用的模型不能删除"), request
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().error().message()).isEqualTo("仍被授权或用量记录引用的模型不能删除");
    }

    @Test
    void doesNotExposeTechnicalArgumentDetails() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/enterprise/admin/v1/models");
        var response = new EnterpriseExceptionHandler().invalidRequest(
            new IllegalArgumentException("SQL 约束冲突：secret token"), request
        );

        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().error().message()).isEqualTo("请求参数不合法");
    }

    @Test
    void mapsResourceInUseToConflictWithBusinessDetails() {
        MockHttpServletRequest request = new MockHttpServletRequest("DELETE", "/enterprise/admin/v1/models/1");
        var response = new EnterpriseExceptionHandler().modelInUse(
            new ManagedModelInUseException(new ManagedModelDeleteBlockers(2, 1, 1, 0, 0)), request
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().error()).satisfies(error -> {
            assertThat(error.code()).isEqualTo(ManagedModelInUseException.ERROR_CODE);
            assertThat(error.message()).contains("配置引用");
            assertThat(error.details()).isEqualTo(new ResourceInUseDetails(2, 1, 1, 0, 0));
        });
    }

    @Test
    void mapsBusinessSpecificDeleteBlockersToConflictDetails() {
        MockHttpServletRequest request = new MockHttpServletRequest("DELETE", "/enterprise/admin/v1/resources/1");
        EnterpriseExceptionHandler handler = new EnterpriseExceptionHandler();

        assertThat(handler.modelSetInUse(
            new ModelSetInUseException(new ModelSetDeleteBlockers(2, 1)), request
        ).getBody().error().details()).isEqualTo(new ModelSetInUseDetails(2, 1));
        assertThat(handler.accessGroupInUse(
            new AccessGroupInUseException(new AccessGroupDeleteBlockers(1, 2, 3)), request
        ).getBody().error().details()).isEqualTo(new AccessGroupInUseDetails(1, 2, 3));
        assertThat(handler.quotaPolicyInUse(
            new QuotaPolicyInUseException(4), request
        ).getBody().error().details()).isEqualTo(new QuotaPolicyInUseDetails(4));
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
