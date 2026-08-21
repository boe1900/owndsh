/**
 * [INPUT]: 依赖生产同款 Sa-Token 1.45 JWT simple logic/内存 DAO、RuoYiPlatformSessionGateway 与 mock 用户/RBAC 服务。
 * [OUTPUT]: 验证 JWT 单 installation kickout 保留设备撤销原因、另一设备有效且普通 kickout 不被误判。
 * [POS]: ruoyi-admin 平台会话 adapter 回归门禁，以真实生产 token 模式覆盖 T22 暴露的旧 Token 失效语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.web.enterprise;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.jwt.StpLogicJwtForSimple;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import org.dromara.system.domain.vo.SysUserVo;
import org.dromara.system.service.ISysUserService;
import org.dromara.web.service.SysLoginService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class RuoYiPlatformSessionGatewayTest {
    private static final long USER_ID = 1761100000000000003L;
    private static final String LOGIN_ID = "sys_user:" + USER_ID;
    private static final String FIRST = "123e4567-e89b-42d3-a456-426614174000";
    private static final String SECOND = "123e4567-e89b-42d3-a456-426614174001";

    private SaTokenConfig previousConfig;
    private SaTokenDao previousDao;
    private StpLogic previousLogic;
    private SaTokenDaoDefaultImpl testDao;
    private StpLogic logic;
    private RuoYiPlatformSessionGateway gateway;

    @BeforeEach
    void setUp() {
        previousConfig = SaManager.getConfig();
        previousDao = SaManager.getSaTokenDao();
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

        ISysUserService users = mock(ISysUserService.class);
        SysUserVo user = mock(SysUserVo.class);
        when(users.selectUserById(USER_ID)).thenReturn(user);
        when(user.getStatus()).thenReturn("0");
        when(user.getUserType()).thenReturn("sys_user");
        gateway = new RuoYiPlatformSessionGateway(users, mock(SysLoginService.class));
    }

    @AfterEach
    void tearDown() {
        testDao.destroy();
        StpUtil.setStpLogic(previousLogic);
        SaManager.setSaTokenDao(previousDao);
        SaManager.setConfig(previousConfig);
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
            .extracting(session -> session.get(RuoYiPlatformSessionGateway.DEVICE_REVOKED_MARKER))
            .isEqualTo(true);
        assertThat(logic.getTokenValueListByLoginId(LOGIN_ID)).containsExactly(secondToken);
        assertThat(logic.getLoginIdByToken(secondToken)).isEqualTo(LOGIN_ID);

        NotLoginException revoked = kicked(firstToken);
        assertThat(RuoYiPlatformSessionGateway.isRevokedDeviceToken(logic, firstToken, revoked)).isTrue();

        logic.kickoutByTokenValue(secondToken);
        assertThat(RuoYiPlatformSessionGateway.isRevokedDeviceToken(
            logic,
            secondToken,
            kicked(secondToken)
        )).isFalse();
    }

    private static SaLoginParameter device(String deviceId) {
        return SaLoginParameter.create()
            .setDeviceType("harness")
            .setDeviceId(deviceId)
            .setIsConcurrent(true)
            .setIsShare(false)
            .setTimeout(12 * 60 * 60);
    }

    private static NotLoginException kicked(String token) {
        return NotLoginException.newInstance(
            StpUtil.TYPE,
            NotLoginException.KICK_OUT,
            NotLoginException.KICK_OUT_MESSAGE,
            token
        );
    }
}
