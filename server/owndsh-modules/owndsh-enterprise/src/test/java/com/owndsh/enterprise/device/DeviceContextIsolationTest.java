/**
 * [INPUT]: 依赖 OwnDshDeviceRequestContextResolver、mock PlatformSessionGateway 与伪造 X-Device-Id request。
 * [OUTPUT]: 验证设备授权上下文只使用 Sa-Token session deviceId，完全忽略客户端设备 header。
 * [POS]: T05 伪造设备 header 安全门禁，直接测试 HTTP 信任边界而非字段命名约定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device;

import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.web.OwnDshDeviceRequestContextResolver;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class DeviceContextIsolationTest {
    @Test
    void ignoresForgedDeviceHeadersAndUsesOnlyServerSessionTerminal() {
        String trusted = "123e4567-e89b-42d3-a456-426614174000";
        PlatformSessionGateway sessions = mock(PlatformSessionGateway.class);
        when(sessions.current()).thenReturn(new PlatformSession(
            1761100000000000003L,
            PlatformClient.DSH_DESKTOP,
            "harness",
            trusted
        ));
        EnterpriseIdentityProperties properties = new EnterpriseIdentityProperties();
        properties.setTenantId("000000");
        OwnDshDeviceRequestContextResolver resolver = new OwnDshDeviceRequestContextResolver(properties, sessions);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Device-Id", "123e4567-e89b-42d3-a456-426614174099");

        var context = resolver.resolve(request);

        assertThat(context.session().deviceId()).isEqualTo(trusted);
        assertThat(context.tenantId()).isEqualTo("000000");
    }
}
