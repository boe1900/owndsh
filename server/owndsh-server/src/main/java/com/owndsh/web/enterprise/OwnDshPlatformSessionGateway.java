/**
 * [INPUT]: 依赖 PlatformSessionGateway、RefreshSessionStore、Host user/RBAC、LoginHelper、Sa-Token 与外部 HTTP(S) 地址。
 * [OUTPUT]: 提供 12 小时平台会话签发/读取，并统一吊销 Access 与 Refresh installation/user 会话。
 * [POS]: owndsh-server 会话 adapter，在 Sa-Token 通用 Cookie 读取关闭时桥接管理 Cookie 并同步长期凭据生命周期。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.web.enterprise;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.context.SaHolder;
import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import lombok.RequiredArgsConstructor;
import com.owndsh.common.mybatis.helper.DataPermissionHelper;
import com.owndsh.common.satoken.utils.LoginHelper;
import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.application.IssuedPlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.application.PlatformSessionRevokedException;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.domain.RefreshSession;
import com.owndsh.enterprise.auth.persistence.RefreshSessionStore;
import com.owndsh.enterprise.auth.web.AdminSessionCookie;
import com.owndsh.system.api.model.LoginUser;
import com.owndsh.system.domain.vo.SysUserVo;
import com.owndsh.system.service.ISysUserService;
import com.owndsh.web.service.SysLoginService;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/**
 * Host 平台 Sa-Token adapter。
 */
@Component
@RequiredArgsConstructor
public final class OwnDshPlatformSessionGateway implements PlatformSessionGateway {
    private static final long SESSION_SECONDS = 12 * 60 * 60;
    static final String DEVICE_REVOKED_MARKER = "enterprise.device-revoked";

    private final ISysUserService userService;
    private final SysLoginService loginService;
    private final EnterpriseIdentityProperties properties;
    private final RefreshSessionStore refreshSessions;

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
        String tokenValue = currentToken();
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

    private String currentToken() {
        String token = StpUtil.getTokenValue();
        if (token != null && !token.isBlank()) return token;
        String cookie = SaHolder.getRequest().getCookieValue(AdminSessionCookie.name(properties.getPublicBaseUrl()));
        if (!AdminSessionCookie.isValidValue(cookie)) return null;
        StpUtil.setTokenValueToStorage(cookie);
        return StpUtil.getTokenValue();
    }

    @Override
    public void logoutCurrent() {
        if (StpUtil.isLogin()) {
            PlatformSession session = current();
            if (session.client() == PlatformClient.DSH_DESKTOP) {
                refreshSessions.revokeInstallation(
                    properties.getTenantId(), session.userId(), session.client(),
                    UUID.fromString(session.deviceId()), RefreshSession.RevocationReason.LOGOUT, Instant.now()
                );
            }
        }
        StpUtil.logout();
    }

    @Override
    public void revokeHarnessDevice(long userId, String installationId) {
        refreshSessions.revokeInstallation(
            properties.getTenantId(), userId, PlatformClient.DSH_DESKTOP, UUID.fromString(installationId),
            RefreshSession.RevocationReason.DEVICE_REVOKED, Instant.now()
        );
        SysUserVo user = loadUser(userId);
        String loginId = user.getUserType() + ":" + userId;
        StpLogic logic = StpUtil.getStpLogic();
        logic.getTerminalListByLoginId(loginId).stream()
            .filter(terminal -> "harness".equals(terminal.getDeviceType()))
            .filter(terminal -> installationId.equals(terminal.getDeviceId()))
            .map(terminal -> terminal.getTokenValue())
            .toList()
            .forEach(token -> revokeDeviceToken(logic, token));
    }

    @Override
    public void revokeUser(long userId) {
        refreshSessions.revokeUser(userId, RefreshSession.RevocationReason.USER_REVOKED, Instant.now());
        SysUserVo user = loadUser(userId);
        StpUtil.getStpLogic().kickout(user.getUserType() + ":" + userId);
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
        SysUserVo user = loadUser(userId);
        if (!"0".equals(user.getStatus())) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        return user;
    }

    private SysUserVo loadUser(long userId) {
        SysUserVo user = DataPermissionHelper.ignore(() -> userService.selectUserById(userId));
        if (user == null || user.getUserType() == null) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        return user;
    }
}
