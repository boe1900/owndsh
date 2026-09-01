/**
 * [INPUT]: 接收已校验的平台 user/client/device 登录事实，并读取当前 Sa-Token 请求上下文。
 * [OUTPUT]: 对外提供签发/读取/注销会话、单 Harness installation 撤销及成员全部终端撤销端口。
 * [POS]: auth/device application 对 RuoYi Sa-Token 组装的 DIP 边界，由 ruoyi-admin adapter 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.auth.domain.PlatformClient;

/**
 * 平台会话网关。
 */
public interface PlatformSessionGateway {
    IssuedPlatformSession issue(long userId, PlatformClient client, String deviceId);

    /**
     * @throws PlatformSessionRevokedException 当前 Token 已由设备撤销流程失效
     */
    PlatformSession current();

    void logoutCurrent();

    void revokeHarnessDevice(long userId, String installationId);

    void revokeUser(long userId);
}
