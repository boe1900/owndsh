/**
 * [INPUT]: 依赖 Sa-Token 1.45 JWT/权限拦截器/mock HTTP context、管理端 Cookie Filter 与平台会话 adapter。
 * [OUTPUT]: 验证管理端 Cookie 在权限注解前生效、单 installation 撤销隔离和成员级全部终端撤销。
 * [POS]: owndsh-server 平台会话回归门禁，覆盖浏览器 Cookie 与 Desktop Bearer 共用的服务端会话事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.web.enterprise;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.context.SaHolder;
import cn.dev33.satoken.context.mock.SaRequestForMock;
import cn.dev33.satoken.context.mock.SaTokenContextMockUtil;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.jwt.StpLogicJwtForSimple;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import jakarta.servlet.http.Cookie;
import com.owndsh.common.satoken.utils.LoginHelper;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.web.AdminSessionCookie;
import com.owndsh.system.domain.vo.SysUserVo;
import com.owndsh.system.service.ISysUserService;
import com.owndsh.web.service.SysLoginService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("dev")
class OwnDshPlatformSessionGatewayTest {
    private static final long USER_ID = 1761100000000000003L;
    private static final String LOGIN_ID = "sys_user:" + USER_ID;
    private static final String FIRST = "123e4567-e89b-42d3-a456-426614174000";
    private static final String SECOND = "123e4567-e89b-42d3-a456-426614174001";

    private SaTokenConfig previousConfig;
    private SaTokenDao previousDao;
    private StpInterface previousStpInterface;
    private StpLogic previousLogic;
    private SaTokenDaoDefaultImpl testDao;
    private StpLogic logic;
    private OwnDshPlatformSessionGateway gateway;
    private EnterpriseIdentityProperties properties;

    @BeforeEach
    void setUp() {
        previousConfig = SaManager.getConfig();
        previousDao = SaManager.getSaTokenDao();
        previousStpInterface = SaManager.getStpInterface();
        previousLogic = StpUtil.getStpLogic();
        testDao = new SaTokenDaoDefaultImpl();
        testDao.init();
        SaManager.setSaTokenDao(testDao);

        SaTokenConfig config = new SaTokenConfig()
            .setTokenName("Enterprise-Device-Revocation")
            .setIsConcurrent(true)
            .setIsShare(false)
            .setTokenStyle("uuid")
            .setJwtSecretKey("enterprise-device-revocation-test-key-32-bytes")
            .setIsPrint(false);
        SaManager.setConfig(config);
        logic = new StpLogicJwtForSimple().setConfig(config);
        StpUtil.setStpLogic(logic);
        SaManager.setStpInterface(new StpInterface() {
            @Override
            public List<String> getPermissionList(Object loginId, String loginType) {
                return List.of("ent:model:read");
            }

            @Override
            public List<String> getRoleList(Object loginId, String loginType) {
                return List.of();
            }
        });

        ISysUserService users = mock(ISysUserService.class);
        SysUserVo user = mock(SysUserVo.class);
        when(users.selectUserById(USER_ID)).thenReturn(user);
        when(user.getStatus()).thenReturn("0");
        when(user.getUserType()).thenReturn("sys_user");
        properties = new EnterpriseIdentityProperties();
        properties.setPublicBaseUrl(URI.create("https://platform.example.test"));
        gateway = new OwnDshPlatformSessionGateway(users, mock(SysLoginService.class), properties);
    }

    @AfterEach
    void tearDown() {
        SaTokenContextMockUtil.clearContext();
        testDao.destroy();
        StpUtil.setStpLogic(previousLogic);
        SaManager.setStpInterface(previousStpInterface);
        SaManager.setSaTokenDao(previousDao);
        SaManager.setConfig(previousConfig);
    }

    @Test
    void readsTheFixedAdminCookieWithoutEnablingGenericSaTokenCookies() {
        SaTokenContextMockUtil.setMockContext();
        String token = logic.createLoginSession(LOGIN_ID, admin("browser-session"));
        ((SaRequestForMock) SaHolder.getRequest()).cookieMap.put(AdminSessionCookie.name(properties.getPublicBaseUrl()), token);

        PlatformSession session = gateway.current();

        assertThat(session.userId()).isEqualTo(USER_ID);
        assertThat(session.client().clientId()).isEqualTo("enterprise-admin");
        assertThat(session.deviceType()).isEqualTo("console");
        assertThat(session.deviceId()).isEqualTo("browser-session");
    }

    @Test
    void readsTheHttpDeploymentCookie() {
        properties.setPublicBaseUrl(URI.create("http://platform.example.test:8080"));
        SaTokenContextMockUtil.setMockContext();
        String token = logic.createLoginSession(LOGIN_ID, admin("browser-session"));
        ((SaRequestForMock) SaHolder.getRequest()).cookieMap.put(AdminSessionCookie.INSECURE_NAME, token);

        assertThat(gateway.current().userId()).isEqualTo(USER_ID);
    }

    @Test
    void exposesTheFixedAdminCookieBeforePermissionAnnotationsRun() throws Exception {
        SaTokenContextMockUtil.setMockContext();
        String token = logic.createLoginSession(LOGIN_ID, admin("browser-session"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new SecuredAdminController())
            .addInterceptors(new SaInterceptor())
            .addFilters(new AdminSessionCookieFilter(properties))
            .build();

        mvc.perform(get("/enterprise/admin/v1/providers")
                .cookie(new Cookie(AdminSessionCookie.name(properties.getPublicBaseUrl()), token)))
            .andExpect(status().isOk())
            .andExpect(content().string("ok"));
    }

    @Test
    void preservesDeviceRevocationReasonWithoutInvalidatingAnotherDevice() {
        String firstToken = logic.createLoginSession(LOGIN_ID, device(FIRST));
        String secondToken = logic.createLoginSession(LOGIN_ID, device(SECOND));

        gateway.revokeHarnessDevice(USER_ID, FIRST);

        assertThat(logic.getLoginIdNotHandle(firstToken))
            .isEqualTo(NotLoginException.KICK_OUT);
        assertThat(logic.getTokenSessionByToken(firstToken, false))
            .isNotNull()
            .extracting(session -> session.get(OwnDshPlatformSessionGateway.DEVICE_REVOKED_MARKER))
            .isEqualTo(true);
        assertThat(logic.getTokenValueListByLoginId(LOGIN_ID)).containsExactly(secondToken);
        assertThat(logic.getLoginIdByToken(secondToken)).isEqualTo(LOGIN_ID);

        NotLoginException revoked = kicked(firstToken);
        assertThat(OwnDshPlatformSessionGateway.isRevokedDeviceToken(logic, firstToken, revoked)).isTrue();

        logic.kickoutByTokenValue(secondToken);
        assertThat(OwnDshPlatformSessionGateway.isRevokedDeviceToken(
            logic,
            secondToken,
            kicked(secondToken)
        )).isFalse();
    }

    @Test
    void revokesEverySessionForOneMember() {
        String firstToken = logic.createLoginSession(LOGIN_ID, device(FIRST));
        String secondToken = logic.createLoginSession(LOGIN_ID, device(SECOND));

        gateway.revokeUser(USER_ID);

        assertThat(logic.getTokenValueListByLoginId(LOGIN_ID)).isEmpty();
        assertThat(logic.getLoginIdNotHandle(firstToken)).isEqualTo(NotLoginException.KICK_OUT);
        assertThat(logic.getLoginIdNotHandle(secondToken)).isEqualTo(NotLoginException.KICK_OUT);
    }

    private static SaLoginParameter device(String deviceId) {
        return SaLoginParameter.create()
            .setDeviceType("harness")
            .setDeviceId(deviceId)
            .setIsConcurrent(true)
            .setIsShare(false)
            .setTimeout(12 * 60 * 60);
    }

    private static SaLoginParameter admin(String deviceId) {
        return device(deviceId)
            .setDeviceType("console")
            .setExtra(LoginHelper.USER_KEY, USER_ID)
            .setExtra(LoginHelper.CLIENT_KEY, "enterprise-admin");
    }

    private static NotLoginException kicked(String token) {
        return NotLoginException.newInstance(
            StpUtil.TYPE,
            NotLoginException.KICK_OUT,
            NotLoginException.KICK_OUT_MESSAGE,
            token
        );
    }

    @RestController
    private static final class SecuredAdminController {
        @GetMapping("/enterprise/admin/v1/providers")
        @SaCheckPermission("ent:model:read")
        String providers() {
            return "ok";
        }
    }
}
