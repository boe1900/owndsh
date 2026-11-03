/**
 * [INPUT]: 依赖 MCP server domain 与端侧 assignment 投影。
 * [OUTPUT]: 验证 runtime snapshot 不泄漏管理端字段，保持插件严格契约可解析。
 * [POS]: mcp/web DTO 回归门禁，隔离数据库和 HTTP 控制器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp;

import com.owndsh.enterprise.mcp.domain.McpServer;
import com.owndsh.enterprise.mcp.web.McpViews;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class McpViewsTest {
    @Test
    void assignmentProjectionContainsOnlyTheRuntimeContract() {
        McpServer server = new McpServer(9001, "000000", "notion", "Notion", "Docs", "streamable-http",
            "https://mcp.example.com", false, Map.of(), Map.of("type", "none"), 30_000,
            Map.of("maxAttempts", 3), McpServer.Status.ACTIVE, 3, 1, Instant.EPOCH, Instant.EPOCH);

        JsonNode projection = JsonMapper.builder().build().valueToTree(McpViews.assignment(server));

        assertThat(projection.has("id")).isTrue();
        assertThat(projection.has("revision")).isTrue();
        assertThat(projection.has("serverName")).isTrue();
        assertThat(projection.has("displayName")).isTrue();
        assertThat(projection.has("description")).isTrue();
        assertThat(projection.has("transport")).isTrue();
        assertThat(projection.has("url")).isTrue();
        assertThat(projection.has("allowInsecureTransport")).isTrue();
        assertThat(projection.has("headers")).isTrue();
        assertThat(projection.has("auth")).isTrue();
        assertThat(projection.has("toolCallTimeoutMs")).isTrue();
        assertThat(projection.has("reconnect")).isTrue();
        assertThat(projection.has("status")).isFalse();
        assertThat(projection.has("createdAt")).isFalse();
        assertThat(projection.has("updatedAt")).isFalse();
    }
}
