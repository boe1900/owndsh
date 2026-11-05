/**
 * [INPUT]: 依赖 EnterpriseIdentityConfiguration 的公网 HTTP(S) authority 与环境 master key 校验边界。
 * [OUTPUT]: 验证合法 HTTP(S) authority、精确 32 字节 master key、console 调试 origin 环境绑定，并拒绝非法 URI 与 key 长度。
 * [POS]: auth 部署配置的轻量回归门禁，使 Java 运行时契约与 T21 安装器保持一致。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class EnterpriseIdentityConfigurationTest {
    @Test
    void bindsConsoleDevOriginsFromEnvironmentValue() {
        // 与 application.yml 的 ${ENT_CONSOLE_DEV_ORIGINS:} 占位符一致：空串绑定空列表，逗号串绑定 URI 列表
        Map<String, String> values = new HashMap<>();
        values.put("enterprise.console-dev-origins", "http://127.0.0.1:62209,https://localhost:5173");
        EnterpriseIdentityProperties bound = new Binder(new MapConfigurationPropertySource(values))
            .bind("enterprise", Bindable.ofInstance(new EnterpriseIdentityProperties()))
            .get();
        assertThat(bound.getConsoleDevOrigins()).containsExactly(
            URI.create("http://127.0.0.1:62209"),
            URI.create("https://localhost:5173")
        );

        Map<String, String> empty = new HashMap<>();
        empty.put("enterprise.console-dev-origins", "");
        EnterpriseIdentityProperties emptyBound = new Binder(new MapConfigurationPropertySource(empty))
            .bind("enterprise", Bindable.ofInstance(new EnterpriseIdentityProperties()))
            .get();
        assertThat(emptyBound.getConsoleDevOrigins()).isEmpty();
    }
    @Test
    void requiresExactlyThirtyTwoMasterKeyBytes() {
        var configuration = new EnterpriseIdentityConfiguration();
        var properties = new EnterpriseIdentityProperties();
        properties.getCrypto().setMasterKey("0123456789abcdef0123456789abcdef");
        assertThat(configuration.enterpriseSecretCipher(properties)).isNotNull();

        properties.getCrypto().setMasterKey("short");
        assertThatThrownBy(() -> configuration.enterpriseSecretCipher(properties))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ENT_MASTER_KEY");
    }

    @Test
    void acceptsHttpAndHttpsAuthorityWithDefaultOrExplicitPort() {
        assertThat(EnterpriseIdentityConfiguration.requirePublicBaseUrl(
            URI.create("http://platform.example.test:8080")
        )).isEqualTo(URI.create("http://platform.example.test:8080"));
        assertThat(EnterpriseIdentityConfiguration.requirePublicBaseUrl(
            URI.create("https://platform.example.test")
        )).isEqualTo(URI.create("https://platform.example.test"));
        assertThat(EnterpriseIdentityConfiguration.requirePublicBaseUrl(
            URI.create("https://platform.example.test:18443/")
        )).isEqualTo(URI.create("https://platform.example.test:18443/"));
    }

    @Test
    void rejectsInvalidPortAndNonAuthorityComponents() {
        for (String value : new String[] {
            "https://platform.example.test:0",
            "https://platform.example.test:65536",
            "ftp://platform.example.test",
            "https://user@platform.example.test",
            "https://platform.example.test/path",
            "https://platform.example.test?query=value",
            "https://platform.example.test#fragment",
        }) {
            assertThatThrownBy(() -> EnterpriseIdentityConfiguration.requirePublicBaseUrl(URI.create(value)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP(S) 根地址");
        }
    }
}
