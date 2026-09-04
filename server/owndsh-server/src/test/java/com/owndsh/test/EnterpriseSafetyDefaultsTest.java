/**
 * [INPUT]: 依赖 owndsh-server 经 Maven 过滤后的 application.yml 与 Spring YAML loader。
 * [OUTPUT]: 验证 graceful drain、请求上限、同源 CORS、单配置环境入口与无默认 JWT secret。
 * [POS]: owndsh-server 的 T20 部署默认值回归，防止配置退化绕过业务层边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.test;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
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
        assertThat(property("spring.datasource.dynamic.datasource.master.password"))
            .isEqualTo("${ENT_POSTGRES_PASSWORD:owndsh}");
        assertThat(property("spring.data.redis.password")).isEqualTo("${ENT_REDIS_PASSWORD:owndsh}");
        assertThat(property("enterprise.crypto.master-key")).isEqualTo("${ENT_MASTER_KEY:}");
        assertThat(property("enterprise.plugin.signing-private-key"))
            .isEqualTo("${ENT_PLUGIN_SIGNING_PRIVATE_KEY:}");
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
