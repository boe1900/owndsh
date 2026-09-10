/**
 * [INPUT]: 依赖 owndsh-server 经 Maven 过滤后的 application.yml、Spring YAML loader 与真实 Logback 配置运行时。
 * [OUTPUT]: 验证 Flyway 基线与 JDBC 类型推断、graceful drain、请求上限、同源 CORS、单配置环境入口、默认关闭插件签名、无默认 JWT secret 与仅 stdout 日志。
 * [POS]: owndsh-server 的 T20 部署默认值回归，防止配置退化绕过业务层边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.test;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.joran.JoranConfigurator;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.util.LogbackMDCAdapter;
import ch.qos.logback.core.ConsoleAppender;
import ch.qos.logback.core.status.Status;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class EnterpriseSafetyDefaultsTest {
    private final List<PropertySource<?>> sources = load();

    @Test
    void freezesBoundedTransportAndGracefulShutdownDefaults() {
        assertThat(property("server.shutdown")).isEqualTo("graceful");
        assertThat(property("spring.lifecycle.timeout-per-shutdown-phase")).isEqualTo("30s");
        assertThat(property("spring.mvc.async.request-timeout")).isEqualTo(-1);
        assertThat(property("server.jetty.max-http-form-post-size")).isEqualTo("1MB");
        assertThat(property("spring.servlet.multipart.max-file-size")).isEqualTo("50MB");
        assertThat(property("spring.servlet.multipart.max-request-size")).isEqualTo("52MB");
        assertThat(property("enterprise.http.max-json-request-bytes"))
            .isEqualTo("${ENT_JSON_REQUEST_MAX_BYTES:2097152}");
        assertThat(property("enterprise.session.max-batch-bytes"))
            .isEqualTo("${ENT_SESSION_BATCH_MAX_BYTES:1048576}");
    }

    @Test
    void rejectsCrossOriginAndRequiresAnExternalJwtSecret() {
        assertThat(property("web.cors.allow-credentials")).isEqualTo(false);
        assertThat(property("web.cors.allowed-origin-patterns")).isEqualTo("");
        assertThat(property("sa-token.jwt-secret-key")).isEqualTo("${SA_TOKEN_JWT_SECRET_KEY}");
    }

    @Test
    void exposesDatabaseRedisAndEnterpriseSecretsAsEnvironmentOverrides() {
        assertThat(property("spring.flyway.enabled")).isEqualTo(true);
        assertThat(property("spring.flyway.baseline-on-migrate")).isEqualTo(true);
        assertThat(property("spring.flyway.baseline-version")).isEqualTo(0);
        assertThat(property("spring.flyway.locations")).isEqualTo("classpath:db/migration");
        assertThat(property("spring.datasource.dynamic.datasource.master.url").toString())
            .contains("stringtype=unspecified");
        assertThat(property("spring.datasource.dynamic.datasource.master.password"))
            .isEqualTo("${ENT_POSTGRES_PASSWORD:owndsh}");
        assertThat(property("spring.data.redis.password")).isEqualTo("${ENT_REDIS_PASSWORD:owndsh}");
        assertThat(property("enterprise.crypto.master-key")).isEqualTo("${ENT_MASTER_KEY:}");
        assertThat(property("enterprise.plugin.signing-enabled"))
            .isEqualTo("${ENT_PLUGIN_SIGNING_ENABLED:false}");
        assertThat(property("enterprise.plugin.signing-private-key"))
            .isEqualTo("${ENT_PLUGIN_SIGNING_PRIVATE_KEY:}");
    }

    @Test
    void emitsApplicationLogsOnlyToStandardOutput() throws Exception {
        assertThat(property("logging.config")).isEqualTo("classpath:logback-plus.xml");
        assertThat(sources).allSatisfy(source -> {
            assertThat(source.getProperty("management.endpoint.logfile.external-file")).isNull();
            assertThat(source.getProperty("logging.file.name")).isNull();
            assertThat(source.getProperty("logging.file.path")).isNull();
        });
        LoggerContext context = new LoggerContext();
        context.setMDCAdapter(new LogbackMDCAdapter());
        try {
            JoranConfigurator configurator = new JoranConfigurator();
            configurator.setContext(context);
            configurator.doConfigure(new ClassPathResource("logback-plus.xml").getURL());
            Logger logger = context.getLogger(Logger.ROOT_LOGGER_NAME);
            var appenders = logger.iteratorForAppenders();
            assertThat(appenders.hasNext()).isTrue();
            var appender = appenders.next();
            assertThat(appender).isInstanceOf(ConsoleAppender.class);
            assertThat(appenders.hasNext()).isFalse();
            var console = (ConsoleAppender<ILoggingEvent>) appender;
            assertThat(console.getTarget()).isEqualTo("System.out");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            console.setOutputStream(output);
            logger.info("标准输出 INFO");
            logger.warn("标准输出 WARN");
            logger.error("标准输出 ERROR", new IllegalStateException("异常堆栈保留"));
            assertThat(output.toString(StandardCharsets.UTF_8))
                .contains("标准输出 INFO", "标准输出 WARN", "标准输出 ERROR", "IllegalStateException: 异常堆栈保留");
            assertThat(context.getStatusManager().getCopyOfStatusList())
                .noneMatch(status -> status.getLevel() == Status.ERROR);
        } finally {
            context.stop();
        }
    }

    private Object property(String name) {
        return sources.stream()
            .map(source -> source.getProperty(name))
            .filter(value -> value != null)
            .findFirst()
            .orElseThrow(() -> new AssertionError("application.yml 缺少 " + name));
    }

    private static List<PropertySource<?>> load() {
        try {
            return new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"));
        } catch (IOException exception) {
            throw new IllegalStateException("application.yml 加载失败", exception);
        }
    }
}
