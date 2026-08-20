/**
 * [INPUT]: 依赖 EnterpriseIdentityConfiguration 的公网 HTTPS authority 校验边界。
 * [OUTPUT]: 验证默认端口与合法显式端口可用，越界端口、路径、查询和 user-info fail-closed。
 * [POS]: auth 部署配置的轻量回归门禁，使 Java 运行时契约与 T21 安装器保持一致。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class EnterpriseIdentityConfigurationTest {
    @Test
    void acceptsHttpsAuthorityWithDefaultOrExplicitPort() {
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
            "https://user@platform.example.test",
            "https://platform.example.test/path",
            "https://platform.example.test?query=value",
            "https://platform.example.test#fragment",
        }) {
            assertThatThrownBy(() -> EnterpriseIdentityConfiguration.requirePublicBaseUrl(URI.create(value)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTPS 根地址");
        }
    }
}
