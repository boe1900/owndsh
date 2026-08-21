/**
 * [INPUT]: 依赖 PlatformSessionGateway、RuoYi user/RBAC 服务、LoginHelper 与 Sa-Token terminal/Token Session API。
 * [OUTPUT]: 对外提供 12 小时非共享平台会话签发、可信当前会话读取和保留撤销原因的单 installation Token kickout。
 * [POS]: ruoyi-admin composition adapter，使 ruoyi-enterprise 不反向依赖 SysLoginService/ISysUserService，并区分设备撤销与普通会话失效。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.web.enterprise;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import lombok.RequiredArgsConstructor;
import org.dromara.common.mybatis.helper.DataPermissionHelper;
import org.dromara.common.satoken.utils.LoginHelper;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.IssuedPlatformSession;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.application.PlatformSessionRevokedException;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.system.api.model.LoginUser;
import org.dromara.system.domain.vo.SysUserVo;
import org.dromara.system.service.ISysUserService;
import org.dromara.web.service.SysLoginService;
import org.springframework.stereotype.Component;

/**
 * RuoYi 平台 Sa-Token adapter。
 */
@Component
@RequiredArgsConstructor
public final class RuoYiPlatformSessionGateway implements PlatformSessionGateway {
    private static final long SESSION_SECONDS = 12 * 60 * 60;
    static final String DEVICE_REVOKED_MARKER = "enterprise.device-revoked";

    private final ISysUserService userService;
    private final SysLoginService loginService;

    @Override
    public IssuedPlatformSession issue(long userId, PlatformClient client, String deviceId) {
        SysUserVo user = loadEnabledUser(userId);
        LoginUser loginUser = loginService.buildLoginUser(user);
        loginUser.setClientKey(client.clientId());
        SaLoginParameter parameters = SaLoginParameter.create()
            .setDeviceType(client.deviceType())
            .setDeviceId(deviceId)
            .setIsConcurrent(true)
            .setIsShare(false)
            .setTimeout(SESSION_SECONDS)
            .setIsWriteHeader(false)
            .setExtra(LoginHelper.CLIENT_KEY, client.clientId())
            .setTerminalExtra(LoginHelper.CLIENT_KEY, client.clientId());
        LoginHelper.login(loginUser, parameters);
        return new IssuedPlatformSession(StpUtil.getTokenValue(), SESSION_SECONDS);
    }

    @Override
    public PlatformSession current() {
        StpLogic logic = StpUtil.getStpLogic();
        String tokenValue = StpUtil.getTokenValue();
        try {
            StpUtil.checkLogin();
        } catch (NotLoginException exception) {
            if (isRevokedDeviceToken(logic, tokenValue, exception)) {
                throw new PlatformSessionRevokedException();
            }
            throw exception;
        }
        Long userId = LoginHelper.getUserId();
        Object clientId = StpUtil.getExtra(LoginHelper.CLIENT_KEY);
        if (userId == null || clientId == null) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        PlatformClient client;
        try {
            client = PlatformClient.parse(clientId.toString());
        } catch (IllegalArgumentException exception) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        return new PlatformSession(
            userId,
            client,
            StpUtil.getLoginDeviceType(),
            StpUtil.getLoginDeviceId()
        );
    }

    @Override
    public void logoutCurrent() {
        StpUtil.logout();
    }

    @Override
    public void revokeHarnessDevice(long userId, String installationId) {
        SysUserVo user = loadEnabledUser(userId);
        String loginId = user.getUserType() + ":" + userId;
        StpLogic logic = StpUtil.getStpLogic();
        logic.getTerminalListByLoginId(loginId).stream()
            .filter(terminal -> "harness".equals(terminal.getDeviceType()))
            .filter(terminal -> installationId.equals(terminal.getDeviceId()))
            .map(terminal -> terminal.getTokenValue())
            .toList()
            .forEach(token -> revokeDeviceToken(logic, token));
    }

    static boolean isRevokedDeviceToken(
        StpLogic logic,
        String tokenValue,
        NotLoginException exception
    ) {
        if (!NotLoginException.KICK_OUT.equals(exception.getType())
            || tokenValue == null
            || tokenValue.isBlank()) {
            return false;
        }
        SaSession tokenSession = logic.getTokenSessionByToken(tokenValue, false);
        return tokenSession != null && Boolean.TRUE.equals(tokenSession.get(DEVICE_REVOKED_MARKER));
    }

    private static void revokeDeviceToken(StpLogic logic, String tokenValue) {
        logic.getTokenSessionByToken(tokenValue, true).set(DEVICE_REVOKED_MARKER, true);
        logic.kickoutByTokenValue(
            tokenValue,
            logic.createSaLogoutParameter().setIsKeepTokenSession(true)
        );
    }

    private SysUserVo loadEnabledUser(long userId) {
        SysUserVo user = DataPermissionHelper.ignore(() -> userService.selectUserById(userId));
        if (user == null || !"0".equals(user.getStatus()) || user.getUserType() == null) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        return user;
    }
}
