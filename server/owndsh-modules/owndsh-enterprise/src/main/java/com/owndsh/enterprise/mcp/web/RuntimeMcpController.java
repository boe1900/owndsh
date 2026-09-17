/**
 * [INPUT]: 依赖 McpService 与可信 DeviceCallContext。
 * [OUTPUT]: 返回当前用户被授予的 MCP assignments。
 * [POS]: mcp/web 的端侧 bootstrap 入口，不接受客户端自填 tenant/user/device。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.web;

import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.mcp.application.McpService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/enterprise/api/v1/mcp")
public final class RuntimeMcpController {
    private final McpService service; private final DeviceRequestContextResolver contexts;
    public RuntimeMcpController(McpService service,DeviceRequestContextResolver contexts){this.service=service;this.contexts=contexts;}
    @GetMapping("/assignments") public EnterpriseResponse<McpViews.Snapshot> assignments(HttpServletRequest req){DeviceCallContext c=contexts.resolve(req);var a=service.assignments(c.tenantId(),c.session().userId()).stream().map(McpViews::server).toList();return new EnterpriseResponse<>(new McpViews.Snapshot(1,service.revision(c.tenantId()),60000,a),c.requestId());}
}
