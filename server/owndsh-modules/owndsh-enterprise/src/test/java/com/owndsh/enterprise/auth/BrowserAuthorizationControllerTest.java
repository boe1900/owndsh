/**
 * [INPUT]: 依赖 MockMvc、浏览器会话/启用成员替身与实际授权 Controller。
 * [OUTPUT]: 验证无管理角色账号摘要、禁用成员和客户端隔离、跨源/跨标签账号变更与 JSON 批准/拒绝边界。
 * [POS]: auth 的浏览器身份 HTTP 门禁，与状态机一次性消费测试互补。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.application.PlatformAuthorizationService;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.web.BrowserAuthorizationController;
import com.owndsh.enterprise.common.api.EnterpriseExceptionHandler;
import com.owndsh.system.domain.vo.SysUserVo;
import com.owndsh.system.service.ISysUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URI;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class BrowserAuthorizationControllerTest {
    private static final String TRANSACTION = "t".repeat(32);
    private static final String CSRF = "c".repeat(32);
    private static final long USER = 1761100000000000003L;
    private final PlatformSessionGateway sessions = mock(PlatformSessionGateway.class);
    private final PlatformAuthorizationService authorization = mock(PlatformAuthorizationService.class);
    private final SysUserVo user = mock(SysUserVo.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        var users = mock(ISysUserService.class);
        when(users.selectUserById(USER)).thenReturn(user);
        when(user.getStatus()).thenReturn("0");
        when(user.getUserName()).thenReturn("employee");
        when(user.getNickName()).thenReturn("Employee");
        when(sessions.current()).thenReturn(new PlatformSession(USER, PlatformClient.ENTERPRISE_ADMIN, "console", "browser"));
        var properties = new EnterpriseIdentityProperties();
        properties.setPublicBaseUrl(URI.create("https://platform.example"));
        mvc = standaloneSetup(new BrowserAuthorizationController(sessions, users, authorization, properties))
            .setControllerAdvice(new EnterpriseExceptionHandler()).build();
    }

    @Test
    void readsBrowserIdentityWithoutConsolePermissionsOrTokens() throws Exception {
        mvc.perform(get("/enterprise/auth/v1/session"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.username").value("employee"))
            .andExpect(jsonPath("$.data.id").value(Long.toString(USER)))
            .andExpect(jsonPath("$.data.accessToken").doesNotExist());
        when(user.getStatus()).thenReturn("1");
        mvc.perform(get("/enterprise/auth/v1/session")).andExpect(status().isUnauthorized())
            .andExpect(header().string("Cache-Control", "no-store"));
        when(sessions.current()).thenReturn(new PlatformSession(USER, PlatformClient.DSH_DESKTOP, "harness", "device"));
        mvc.perform(get("/enterprise/auth/v1/session")).andExpect(status().isUnauthorized())
            .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void bindsDecisionToTheDisplayedAccountAndRejectsCrossOriginWrites() throws Exception {
        String body = "{\"transactionId\":\"" + TRANSACTION + "\",\"csrfToken\":\"" + CSRF
            + "\",\"userId\":\"" + USER + "\",\"approved\":true}";
        when(authorization.authorizeFromBrowser(anyString(), anyString(), anyBoolean(), any()))
            .thenReturn(URI.create("http://127.0.0.1:18080/callback?code=grant&state=state"));
        mvc.perform(post("/enterprise/auth/v1/authorization").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.redirectUri").value(
                "http://127.0.0.1:18080/callback?code=grant&state=state"));
        verify(authorization).authorizeFromBrowser(eq(TRANSACTION), eq(CSRF), eq(true), any());
        clearInvocations(authorization);
        mvc.perform(post("/enterprise/auth/v1/authorization").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(Long.toString(USER), "1761100000000000004")))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/enterprise/auth/v1/authorization").contentType(MediaType.APPLICATION_JSON)
                .header("Origin", "https://attacker.example").content(body))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/enterprise/auth/v1/authorization").contentType(MediaType.APPLICATION_JSON)
                .content(body.replace(TRANSACTION, "invalid")))
            .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"));
        verifyNoInteractions(authorization);
    }
}
