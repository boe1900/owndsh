/**
 * [INPUT]: 接收当前 HttpServletRequest。
 * [OUTPUT]: 对外提供服务端固定 tenant 与可信 Sa-Token PlatformSession 的 DeviceCallContext。
 * [POS]: device/web Controller 的 DIP 边界，使 HTTP 入口不读取 X-Device-Id 或静态登录上下文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.device.application.DeviceCallContext;

@FunctionalInterface
public interface DeviceRequestContextResolver {
    DeviceCallContext resolve(HttpServletRequest request);
}
