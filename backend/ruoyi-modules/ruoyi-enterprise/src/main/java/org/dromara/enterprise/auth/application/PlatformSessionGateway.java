/**
 * [INPUT]: 接收已校验的平台 user/client/device 登录事实，并读取当前 Sa-Token 请求上下文。
 * [OUTPUT]: 对外提供签发 12 小时非共享会话、读取/注销当前会话与按 Harness installation 撤销终端的端口。
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

    PlatformSession current();

    void logoutCurrent();

    void revokeHarnessDevice(long userId, String installationId);
}
