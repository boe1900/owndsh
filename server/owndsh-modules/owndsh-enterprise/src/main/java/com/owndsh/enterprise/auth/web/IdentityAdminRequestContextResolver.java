/**
 * [INPUT]: 接收当前 HttpServletRequest。
 * [OUTPUT]: 对外提供服务端可信 EnterpriseRequestContext 解析端口。
 * [POS]: auth/web Controller 的 DIP 边界，使领域调用不依赖 Sa-Token 或 Servlet 静态上下文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 管理员请求上下文解析端口。
 */
public interface IdentityAdminRequestContextResolver {
    EnterpriseRequestContext resolve(HttpServletRequest request);
}
