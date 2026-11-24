/**
 * [INPUT]: 依赖固定 public client 的回调策略与 UUID installation 约束。
 * [OUTPUT]: 验证移动回调逐字放行、相近 URI 拒绝，以及原有 loopback 和管理端边界。
 * [POS]: auth 的纯领域边界回归，不依赖 Redis 或浏览器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.domain.PlatformClient;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

@Tag("dev")
class PlatformClientTest {
    private static final UUID INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private static final URI MOBILE = URI.create("com.owndsh.mobile://oauth/callback");
    private static final URI ADMIN = URI.create("https://platform.example/enterprise/auth/callback");

    @Test
    void acceptsOnlyTheExactMobileCallbackForHarness() {
        assertThatCode(() -> PlatformClient.DSH_DESKTOP.validate(MOBILE, INSTALLATION, ADMIN))
            .doesNotThrowAnyException();
        for (String value : new String[] {
            "owndsh://oauth/callback",
            "com.owndsh.mobile.other://oauth/callback",
            "COM.OWNDSH.MOBILE://oauth/callback",
            "com.owndsh.mobile://OAUTH/callback",
            "com.owndsh.mobile://other/callback",
            "com.owndsh.mobile://oauth:1234/callback",
            "com.owndsh.mobile://user@oauth/callback",
            "com.owndsh.mobile://oauth/%63allback",
            "com.owndsh.mobile://oauth/callback/extra",
            "com.owndsh.mobile://oauth/callback?next=other",
            "com.owndsh.mobile://oauth/callback#fragment"
        }) {
            assertThatIllegalArgumentException().as(value)
                .isThrownBy(() -> PlatformClient.DSH_DESKTOP.validate(URI.create(value), INSTALLATION, ADMIN));
        }
    }

    @Test
    void keepsInstallationAndManagementClientBoundaries() {
        assertThatIllegalArgumentException()
            .isThrownBy(() -> PlatformClient.DSH_DESKTOP.validate(MOBILE, null, ADMIN));
        assertThatIllegalArgumentException().isThrownBy(() -> PlatformClient.DSH_DESKTOP.validate(
            MOBILE, UUID.fromString("123e4567-e89b-12d3-a456-426614174000"), ADMIN
        ));
        assertThatIllegalArgumentException()
            .isThrownBy(() -> PlatformClient.ENTERPRISE_ADMIN.validate(MOBILE, null, ADMIN));
        assertThatCode(() -> PlatformClient.DSH_DESKTOP.validate(
            URI.create("http://127.0.0.1:18080/callback"), INSTALLATION, ADMIN
        )).doesNotThrowAnyException();
        assertThatCode(() -> PlatformClient.ENTERPRISE_ADMIN.validate(ADMIN, null, ADMIN))
            .doesNotThrowAnyException();
    }
}
