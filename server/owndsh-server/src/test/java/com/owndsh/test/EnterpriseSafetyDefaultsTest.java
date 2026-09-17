/**
 * [INPUT]: 依赖 owndsh-server 经 Maven 过滤后的 application.yml、Spring YAML loader、真实 Servlet 过滤器与 Logback 配置运行时。
 * [OUTPUT]: 验证模型网关原生 JSON 不被 HTML 清洗，以及 Flyway/JDBC、graceful drain、请求上限、CORS、环境入口、插件签名、JWT 与 stdout 默认值。
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
import com.owndsh.common.web.config.FilterConfig;
import com.owndsh.common.web.config.properties.XssProperties;
import com.owndsh.common.web.filter.RepeatableFilter;
import com.owndsh.common.web.filter.XssFilter;
import com.owndsh.common.web.filter.XssHttpServletRequestWrapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockFilterConfig;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class EnterpriseSafetyDefaultsTest {
    private final List<PropertySource<?>> sources = load();

    @Test
    void preservesGatewayJsonThroughGlobalFilters() throws Exception {
        var json = JsonMapper.builder().build();
        var body = json.createObjectNode().put("model", "managed").put("stream", true);
        var messages = body.putArray("messages");
        messages.addObject().put("role", "user")
            .put("content", "上下文".repeat(30_000) + "<html><script>if (a < b) run()</script></html>");
        messages.addObject().put("role", "assistant").putArray("tool_calls").addObject()
            .put("id", "call-1").put("type", "function").putObject("function")
            .put("name", "shell").put("arguments", json.writeValueAsString(java.util.Map.of("command", "a < b")));
        messages.addObject().put("role", "tool").put("tool_call_id", "call-1")
            .put("content", "> output\n<svg id=\"scene\">内容</svg>");
        byte[] original = json.writeValueAsBytes(body);
        var filter = configuredXssFilter();
        for (String operation : List.of("chat/completions", "responses", "messages")) {
            String path = "/enterprise/gateway/v1/" + operation;
            var request = new MockHttpServletRequest("POST", path);
            request.setServletPath(path);
            request.setContentType("application/json");
            request.setContent(original);
            filter.doFilter(request, new MockHttpServletResponse(), (filtered, response) ->
                new RepeatableFilter().doFilter(filtered, response, (cached, ignored) -> {
                    byte[] actual = cached.getInputStream().readAllBytes();
                    assertThat(actual).as("%s 原生字节必须保持完整", path).isEqualTo(original);
                    assertThat(json.readTree(actual)).isEqualTo(body);
                }));
        }
    }

    @Test
    void keepsXssFilteringOutsideTheModelGateway() throws Exception {
        assertThat(property("xss.enabled")).isEqualTo(true);
        var request = new MockHttpServletRequest("POST", "/system/user");
        request.setServletPath("/system/user");
        request.setContentType("application/json");
        request.setContent("{\"name\":\"<b>name</b>\"}".getBytes(StandardCharsets.UTF_8));
        configuredXssFilter().doFilter(request, new MockHttpServletResponse(), (filtered, response) -> {
            assertThat(filtered).isInstanceOf(XssHttpServletRequestWrapper.class);
            assertThat(new String(filtered.getInputStream().readAllBytes(), StandardCharsets.UTF_8))
                .isEqualTo("{\"name\":\"name\"}");
        });
    }

    private XssFilter configuredXssFilter() throws Exception {
        var properties = new MutablePropertySources();
        sources.forEach(properties::addLast);
        var xss = new Binder(ConfigurationPropertySources.from(properties)).bind("xss", XssProperties.class).get();
        var filter = new FilterConfig().xssFilter(xss);
        filter.init(new MockFilterConfig());
        return filter;
    }

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
