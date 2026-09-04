/**
 * [INPUT]: 由平台会话 adapter 在服务端确认当前 Token 带设备撤销标记后创建。
 * [OUTPUT]: 对外提供不携带 Token、用户或 installation 的设备会话撤销信号。
 * [POS]: auth application 的基础设施中立失败契约，由设备 Web 边界翻译为 ENT_DEVICE_REVOKED。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

/**
 * 当前平台会话因设备撤销而失效。
 */
public final class PlatformSessionRevokedException extends RuntimeException {
    public PlatformSessionRevokedException() {
        super("平台设备会话已撤销", null, false, false);
    }
}
