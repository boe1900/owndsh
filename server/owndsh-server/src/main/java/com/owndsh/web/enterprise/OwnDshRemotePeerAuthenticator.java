/**
 * [INPUT]: 接收 Remote Netty upgrade 的 Bearer/Cookie Token，读取 Sa-Token 当前终端事实。
 * [OUTPUT]: 提供租户、成员、设备类型和 installation identity，禁止向 Remote 模块泄露 Token。
 * [POS]: owndsh-server 的平台会话 adapter，把 Sa-Token 具体 API 隔离在 server 入口模块。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.web.enterprise;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.owndsh.common.satoken.utils.LoginHelper;
import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.remote.RemotePeerAuthenticator;
import com.owndsh.enterprise.remote.RemotePeerIdentity;
import org.springframework.stereotype.Component;

import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public final class OwnDshRemotePeerAuthenticator implements RemotePeerAuthenticator {
    private static final Logger LOG = LoggerFactory.getLogger(OwnDshRemotePeerAuthenticator.class);
    private final EnterpriseIdentityProperties properties;

    public OwnDshRemotePeerAuthenticator(EnterpriseIdentityProperties properties) {
        this.properties = properties;
    }

    @Override
    public Optional<RemotePeerIdentity> authenticate(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        StpLogic logic = StpUtil.getStpLogic();
        Object loginId;
        try {
            loginId = logic.getLoginIdByToken(token);
        } catch (RuntimeException exception) {
            LOG.warn("Remote token could not be decoded", exception);
            return Optional.empty();
        }
        if (loginId == null) return Optional.empty();
        long actorId = actorId(loginId);
        String deviceType = logic.getLoginDeviceTypeByToken(token);
        String deviceId = logic.getLoginDeviceIdByToken(token);
        if (actorId <= 0 || deviceType == null || deviceId == null) {
            LOG.warn("Remote token identity incomplete: actorId={}, deviceType={}, deviceId={}", actorId, deviceType, deviceId);
            return Optional.empty();
        }
        return Optional.of(new RemotePeerIdentity(properties.getTenantId(), actorId, deviceType, deviceId));
    }

    private static long actorId(Object loginId) {
        if (loginId instanceof Number number) return number.longValue();
        if (loginId == null) return -1;
        String value = loginId.toString();
        int separator = value.lastIndexOf(':');
        try { return Long.parseLong(separator < 0 ? value : value.substring(separator + 1)); }
        catch (NumberFormatException exception) { return -1; }
    }
}
