/**
 * [INPUT]: 依赖 ConsoleDevOrigins 领域白名单与 JUnit 断言。
 * [OUTPUT]: 验证 loopback-only/显式端口/无路径 query fragment 的启动校验、回调派生精确匹配与 Origin 比较语义。
 * [POS]: auth 领域调试白名单的纯单元门禁；不触网、不依赖 Spring。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.domain.ConsoleDevOrigins;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class ConsoleDevOriginsTest {
    @Test
    void acceptsLoopbackOriginWithExplicitPortAndDerivesExactCallback() {
        ConsoleDevOrigins origins = ConsoleDevOrigins.of(List.of(
            URI.create("http://127.0.0.1:62209"),
            URI.create("https://localhost:5173"),
            URI.create("http://[::1]:3000")
        ));

        assertThat(origins.containsCallback(URI.create("http://127.0.0.1:62209/enterprise/auth/callback"))).isTrue();
        assertThat(origins.containsCallback(URI.create("https://localhost:5173/enterprise/auth/callback"))).isTrue();
        assertThat(origins.containsCallback(URI.create("http://[::1]:3000/enterprise/auth/callback"))).isTrue();

        // 回调必须逐字节一致：换端口、换路径、带 query 都不算
        assertThat(origins.containsCallback(URI.create("http://127.0.0.1:62210/enterprise/auth/callback"))).isFalse();
        assertThat(origins.containsCallback(URI.create("http://127.0.0.1:62209/enterprise/auth/callback/extra"))).isFalse();
        assertThat(origins.containsCallback(URI.create("http://127.0.0.1:62209/enterprise/auth/callback?x=1"))).isFalse();

        // Origin/Referer 只比较 scheme/host/port，路径与大小写不参与
        assertThat(origins.trusts(URI.create("http://127.0.0.1:62209"))).isTrue();
        assertThat(origins.trusts(URI.create("http://127.0.0.1:62209/console/skills"))).isTrue();
        assertThat(origins.trusts(URI.create("http://localhost:62209"))).isFalse();
        assertThat(origins.trusts(URI.create("http://127.0.0.1:62209.evil.example"))).isFalse();
        assertThat(origins.trusts(URI.create("ftp://127.0.0.1:62209"))).isFalse();
    }

    @Test
    void emptyOrNullConfigurationYieldsHarmlessAllowlist() {
        assertThat(ConsoleDevOrigins.of(null).isEmpty()).isTrue();
        assertThat(ConsoleDevOrigins.of(List.of()).isEmpty()).isTrue();
        assertThat(ConsoleDevOrigins.of(null).containsCallback(URI.create("http://127.0.0.1:62209/enterprise/auth/callback"))).isFalse();
        assertThat(ConsoleDevOrigins.of(null).trusts(URI.create("http://127.0.0.1:62209"))).isFalse();
    }

    @Test
    void rejectsNonLoopbackMissingPortAndDecoratedOriginsAtStartup() {
        for (String value : new String[] {
            "https://evil.example",
            "https://owndsh.dev.rockycore.cn:62209",
            "http://127.0.0.2:62209",
            "http://127.0.0.1",           // 缺显式端口
            "http://127.0.0.1:80",        // 端口低于 1024
            "http://127.0.0.1:65536",     // 端口越界
            "ftp://127.0.0.1:62209",
            "http://user@127.0.0.1:62209",
            "http://127.0.0.1:62209/console",
            "http://127.0.0.1:62209?x=1",
            "http://127.0.0.1:62209#fragment"
        }) {
            assertThatThrownBy(() -> ConsoleDevOrigins.of(List.of(URI.create(value))))
                .as(value)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("enterprise.console-dev-origins");
        }
    }
}
