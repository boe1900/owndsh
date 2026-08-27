/**
 * [INPUT]: 依赖 SecurityConfig 的全局登录校验路由边界。
 * [OUTPUT]: 验证企业 API 下沉领域 context，非企业 API 继续由全局 Sa-Token 拦截器校验。
 * [POS]: ruoyi-admin 的安全路由回归门禁，防止全局拦截器再次吞掉设备撤销等企业领域语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.common.security.config;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class SecurityConfigEnterpriseRouteTest {
    @Test
    void delegatesEnterpriseAuthenticationToDomainRequestContexts() {
        assertThat(SecurityConfig.requiresGlobalLoginCheck("/enterprise/api/v1/bootstrap")).isFalse();
        assertThat(SecurityConfig.requiresGlobalLoginCheck("/enterprise/admin/v1/devices")).isFalse();
        assertThat(SecurityConfig.requiresGlobalLoginCheck("/enterprise/gateway/v1/chat/completions")).isFalse();
        assertThat(SecurityConfig.requiresGlobalLoginCheck("/enterprise/gateway/v1/responses")).isFalse();
        assertThat(SecurityConfig.requiresGlobalLoginCheck("/enterprise/gateway/v1/messages")).isFalse();

        assertThat(SecurityConfig.requiresGlobalLoginCheck("/system/user/list")).isTrue();
        assertThat(SecurityConfig.requiresGlobalLoginCheck("/auth/logout")).isTrue();
    }
}
