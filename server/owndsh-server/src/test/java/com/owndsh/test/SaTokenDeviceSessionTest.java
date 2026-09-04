/**
 * [INPUT]: 依赖 Sa-Token 1.45.0 StpLogic、SaLoginParameter 与内存 SaTokenDaoDefaultImpl
 * [OUTPUT]: 验证同一用户按 deviceId 签发不共享 Token，且注销单 Token 不影响另一设备
 * [POS]: owndsh-server 的 T01 平台会话技术验收，锁定 T05 设备会话实现所依赖的真实框架语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.test;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("T01 Sa-Token 多设备会话")
@Tag("dev")
class SaTokenDeviceSessionTest {

    private static final String LOGIN_ID = "enterprise-user-1";
    private SaTokenConfig previousConfig;
    private SaTokenDao previousDao;
    private SaTokenDaoDefaultImpl testDao;
    private StpLogic logic;

    @BeforeEach
    void setUp() {
        previousConfig = SaManager.getConfig();
        previousDao = SaManager.getSaTokenDao();
        testDao = new SaTokenDaoDefaultImpl();
        testDao.init();
        SaManager.setSaTokenDao(testDao);

        SaTokenConfig config = new SaTokenConfig()
            .setTokenName("Enterprise-T01")
            .setIsConcurrent(true)
            .setIsShare(false)
            .setTokenStyle("uuid")
            .setIsPrint(false);
        SaManager.setConfig(config);
        logic = new StpLogic("enterprise-t01").setConfig(config);
    }

    @AfterEach
    void tearDown() {
        testDao.destroy();
        SaManager.setSaTokenDao(previousDao);
        SaManager.setConfig(previousConfig);
    }

    @Test
    @DisplayName("同一用户两台 Harness 设备 Token 不共享且可独立注销")
    void createsIndependentDeviceSessionsAndRevokesOnlyOneToken() {
        String firstToken = logic.createLoginSession(LOGIN_ID, device("installation-a"));
        String secondToken = logic.createLoginSession(LOGIN_ID, device("installation-b"));

        assertNotEquals(firstToken, secondToken);
        assertEquals("harness", logic.getLoginDeviceTypeByToken(firstToken));
        assertEquals("installation-a", logic.getLoginDeviceIdByToken(firstToken));
        assertEquals("installation-b", logic.getLoginDeviceIdByToken(secondToken));
        assertTrue(logic.getTokenValueListByLoginId(LOGIN_ID).containsAll(List.of(firstToken, secondToken)));

        logic.logoutByTokenValue(firstToken);

        List<String> remaining = logic.getTokenValueListByLoginId(LOGIN_ID);
        assertFalse(remaining.contains(firstToken));
        assertTrue(remaining.contains(secondToken));
        assertEquals(LOGIN_ID, logic.getLoginIdByToken(secondToken));
    }

    private static SaLoginParameter device(String deviceId) {
        return SaLoginParameter.create()
            .setDeviceType("harness")
            .setDeviceId(deviceId)
            .setIsConcurrent(true)
            .setIsShare(false)
            .setTimeout(12 * 60 * 60);
    }
}
